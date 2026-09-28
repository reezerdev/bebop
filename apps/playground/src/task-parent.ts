import type { createBebopClient } from "../bebop-generated-client.js";

type BebopClient = ReturnType<typeof createBebopClient>;

async function assertAcyclicParent(
  tasks: BebopClient["tasks"],
  taskId: string | undefined,
  parentTaskId: string | undefined,
): Promise<void> {
  const visited = new Set<string>();
  let currentId = parentTaskId;

  while (currentId) {
    if (currentId === taskId) {
      throw new Error("A task cannot be assigned beneath one of its descendants.");
    }
    if (visited.has(currentId)) {
      throw new Error("The selected parent chain already contains a cycle.");
    }
    visited.add(currentId);

    const parent = await tasks.findById(currentId);
    if (!parent) {
      throw new Error("The selected parent task is no longer available.");
    }
    currentId = parent.parentTaskId;
  }
}

/** Applies the Playground's task-tree rule to every shared-client Task mutation. */
export function withAcyclicTaskParents(client: BebopClient): BebopClient {
  const tasks = client.tasks;

  return {
    ...client,
    tasks: {
      ...tasks,
      async create(data) {
        await assertAcyclicParent(tasks, undefined, data.parentTaskId);
        return tasks.create(data);
      },
      async update(id, data) {
        const current = await tasks.findById(id);
        if (!current) throw new Error(`Could not find tasks document "${id}" in the local database.`);
        const parentTaskId = Object.hasOwn(data, "parentTaskId") ? data.parentTaskId : current.parentTaskId;
        if (parentTaskId !== current.parentTaskId) await assertAcyclicParent(tasks, id, parentTaskId);
        return tasks.update(id, data);
      },
    },
  };
}
