import { useMemo, useState } from "react";
import { Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAll, useDb, JazzProvider } from "jazz-tools/expo";
import { createBebopClient } from "@bebop/client";

function TodoScreen() {
  const db = useDb();
  const client = useMemo(() => createBebopClient(db), [db]);
  const { data: todos } = useAll(client.todos.query({ includeTimestamps: true, orderBy: { field: "$createdAt", direction: "desc" } }));
  const [title, setTitle] = useState("");

  async function addTodo() {
    const value = title.trim();
    if (!value) return;
    await client.todos.create({ title: value });
    setTitle("");
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>BEBOP · EXPO</Text>
        <Text style={styles.heading}>Your tasks,{"\n"}wherever you are.</Text>
        <Text style={styles.description}>This native app uses the same Bebop config and generated Jazz client as the web app.</Text>
        <View style={styles.form}>
          <TextInput value={title} onChangeText={setTitle} placeholder="What are you working on?" placeholderTextColor="#777" style={styles.input} returnKeyType="done" onSubmitEditing={() => void addTodo()} />
          <Pressable onPress={() => void addTodo()} style={styles.addButton}><Text style={styles.addText}>Add todo</Text></Pressable>
        </View>
        <Text style={styles.sectionHeading}>Todos <Text style={styles.count}>{todos?.length ?? 0}</Text></Text>
        {!todos?.length ? <Text style={styles.empty}>Add a todo to try local-first data on native.</Text> : todos.map((todo) => (
          <View key={todo.id} style={styles.row}>
            <Pressable style={styles.todoLabel} onPress={() => void client.todos.update(todo.id, { completed: !todo.completed })}>
              <Text style={styles.check}>{todo.completed ? "✓" : "○"}</Text>
              <Text style={todo.completed ? styles.done : styles.todoTitle}>{todo.title}</Text>
            </Pressable>
            <Pressable accessibilityLabel={"Delete " + todo.title} onPress={() => void client.todos.delete(todo.id)}><Text style={styles.delete}>Delete</Text></Pressable>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <JazzProvider
      appId="bebop-starter"
      serverUrl={process.env.EXPO_PUBLIC_JAZZ_SERVER_URL ?? getDefaultJazzUrl()}
      initial="local-first"
      env="dev"
    >
      <TodoScreen />
    </JazzProvider>
  );
}

function getDefaultJazzUrl() {
  // The Android emulator reaches the host computer through 10.0.2.2.
  return Platform.OS === "android" ? "http://10.0.2.2:1625" : "http://127.0.0.1:1625";
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#090909" },
  content: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 48 },
  eyebrow: { color: "#999", fontSize: 11, letterSpacing: 2, marginBottom: 18 },
  heading: { color: "#f5f5f5", fontSize: 38, fontWeight: "700", lineHeight: 42, letterSpacing: -1.4 },
  description: { color: "#aaa", fontSize: 15, lineHeight: 23, marginTop: 14, marginBottom: 28 },
  form: { gap: 10, marginBottom: 32 },
  input: { borderColor: "#404040", borderWidth: 1, color: "#f5f5f5", paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  addButton: { alignItems: "center", backgroundColor: "#eee", padding: 13 },
  addText: { color: "#090909", fontSize: 15, fontWeight: "600" },
  sectionHeading: { color: "#f5f5f5", fontSize: 17, fontWeight: "600", marginBottom: 8 },
  count: { color: "#999", fontSize: 13, fontWeight: "400" },
  empty: { borderTopColor: "#252525", borderTopWidth: 1, color: "#999", paddingVertical: 16 },
  row: { alignItems: "center", borderTopColor: "#252525", borderTopWidth: 1, flexDirection: "row", justifyContent: "space-between", paddingVertical: 15 },
  todoLabel: { alignItems: "center", flexDirection: "row", flex: 1, gap: 12 },
  check: { color: "#ddd", fontSize: 17 },
  todoTitle: { color: "#f5f5f5", fontSize: 15 },
  done: { color: "#777", fontSize: 15, textDecorationLine: "line-through" },
  delete: { color: "#999", fontSize: 13, paddingLeft: 12 },
});
