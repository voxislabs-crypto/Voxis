import { createContext, useContext, useMemo, useState } from "react";
import { buildMemoryDisplay } from "../lib/memoryPresentation.js";

const PersonaStateContext = createContext(null);

function toList(value) {
  return Array.isArray(value) ? value : [];
}

function toText(value) {
  return String(value || "").trim();
}

function bucketMemory(memory) {
  const type = String(memory?.memory_type || memory?.memoryType || "").toLowerCase();

  if (type.includes("user")) {
    return "user";
  }
  if (type.includes("anchor") || type.includes("correct") || type.includes("repair")) {
    return "corrected";
  }
  if (type.includes("scheme") || type.includes("grudge") || type.includes("leverage") || type.includes("target") || type.includes("debt")) {
    return "generated";
  }
  if (type.includes("event") || type.includes("context") || type.includes("note")) {
    return "learned";
  }
  return "self";
}

function buildPersonaTree(personality, memoryItems) {
  const traits = toList(personality?.traits).map((item, index) => ({
    id: `traits-${index}`,
    type: "leaf",
    label: toText(item) || `Trait ${index + 1}`,
    children: [],
    dataRef: { kind: "persona-array", field: "traits", index },
  }));

  const quirks = toList(personality?.quirks).map((item, index) => ({
    id: `quirks-${index}`,
    type: "leaf",
    label: toText(item) || `Quirk ${index + 1}`,
    children: [],
    dataRef: { kind: "persona-array", field: "quirks", index },
  }));

  const sayingsSource = toList(personality?.sayings).length ? personality?.sayings : personality?.notablePhrases;
  const sayings = toList(sayingsSource).map((item, index) => ({
    id: `sayings-${index}`,
    type: "leaf",
    label: toText(item) || `Saying ${index + 1}`,
    children: [],
    dataRef: { kind: "persona-array", field: "notablePhrases", index },
  }));

  const mood = [
    {
      id: "mood-label",
      type: "leaf",
      label: toText(personality?.moodLabel || personality?.mood) || "neutral",
      children: [],
      dataRef: { kind: "persona-scalar", field: "moodLabel" },
    },
  ];

  const grouped = {};
  for (const memory of toList(memoryItems)) {
    const bucket = bucketMemory(memory);
    if (!grouped[bucket]) {
      grouped[bucket] = [];
    }
    grouped[bucket].push(memory);
  }

  const memorySubcategories = Object.entries(grouped).map(([subcategory, items]) => ({
    id: `memory-${subcategory}`,
    type: "category",
    label: subcategory,
    children: items.map((memory, index) => {
      const display = buildMemoryDisplay(memory, index + 1);
      return {
        id: `memory-item-${memory.id}`,
        type: "leaf",
        label: display.title,
        children: [],
        dataRef: {
          kind: "memory-item",
          memoryId: memory.id,
          memoryType: memory.memory_type || memory.memoryType || "fact",
        },
      };
    }),
    dataRef: { kind: "memory-category", subcategory },
  }));

  return [
    { id: "traits", type: "trait", label: "Traits", children: traits, dataRef: { kind: "category", key: "traits" } },
    { id: "quirks", type: "trait", label: "Quirks", children: quirks, dataRef: { kind: "category", key: "quirks" } },
    { id: "sayings", type: "trait", label: "Sayings", children: sayings, dataRef: { kind: "category", key: "sayings" } },
    { id: "mood", type: "category", label: "Mood", children: mood, dataRef: { kind: "category", key: "mood" } },
    { id: "memory", type: "memory", label: "Memory", children: memorySubcategories, dataRef: { kind: "category", key: "memory" } },
  ];
}

export function PersonaStateProvider({
  children,
  personality,
  memoryItems,
  onUpdatePersonaField,
  onUpdateMemoryItem,
  editorTarget,
  setEditorTarget,
}) {
  const [recentlyAccessedId, setRecentlyAccessedId] = useState(null);

  const personaTree = useMemo(
    () => buildPersonaTree(personality, memoryItems),
    [personality, memoryItems],
  );

  const treeIndex = useMemo(() => {
    const map = new Map();

    function walk(node, parentId = null) {
      map.set(node.id, { ...node, parentId });
      for (const child of node.children || []) {
        walk(child, node.id);
      }
    }

    for (const node of personaTree) {
      walk(node);
    }

    return map;
  }, [personaTree]);

  const value = useMemo(
    () => ({
      personality,
      memoryItems,
      personaTree,
      treeIndex,
      recentlyAccessedId,
      editorTarget,
      setEditorTarget,
      markRecentlyAccessed: setRecentlyAccessedId,
      updatePersonaField: onUpdatePersonaField,
      updateMemoryItem: onUpdateMemoryItem,
    }),
    [
      personality,
      memoryItems,
      personaTree,
      treeIndex,
      recentlyAccessedId,
      editorTarget,
      setEditorTarget,
      onUpdatePersonaField,
      onUpdateMemoryItem,
    ],
  );

  return <PersonaStateContext.Provider value={value}>{children}</PersonaStateContext.Provider>;
}

export function usePersonaState() {
  return useContext(PersonaStateContext);
}
