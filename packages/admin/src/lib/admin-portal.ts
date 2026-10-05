import { createContext, type RefObject } from "react";

export const AdminPortalContainer = createContext<RefObject<HTMLDivElement | null> | null>(null);
