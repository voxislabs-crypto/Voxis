import { useState } from "react";

/**
 * Reusable tree navigator for the house palette control panels.
 * Used across Persona Editor, Voice Lab, Settings, Adversarial Eval.
 *
 * Props:
 * - tree: array of { id, label, children?: [{id, label}] }
 * - selectedId: current leaf id
 * - onSelect: (id) => void
 * - renderContent: (selectedId) => ReactNode
 * - title?: string (defaults to "CONTROL")
 */
export default function ControlTree({
  tree = [],
  selectedId,
  onSelect,
  renderContent,
  title = "CONTROL",
}) {
  const [expanded, setExpanded] = useState(() => {
    // Auto-expand the parent of the initial selection
    const initial = new Set();
    for (const parent of tree) {
      if (parent.children?.some((c) => c.id === selectedId)) {
        initial.add(parent.id);
      }
    }
    return initial;
  });

  function toggleParent(parentId) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }

  function handleSelect(childId, parentId) {
    onSelect(childId);
    if (parentId && !expanded.has(parentId)) {
      setExpanded((prev) => new Set(prev).add(parentId));
    }
  }

  const activeParentId = tree.find((p) =>
    p.children?.some((c) => c.id === selectedId)
  )?.id;

  return (
    <div className="house-split">
      {/* Left Tree */}
      <div className="house-tree">
        <div className="house-tree-root">{title}</div>

        {tree.map((parent) => {
          const isExpanded = expanded.has(parent.id);
          const isActiveParent = activeParentId === parent.id;

          return (
            <div key={parent.id}>
              <button
                type="button"
                className={`house-tree-parent ${isExpanded ? "expanded" : ""} ${isActiveParent ? "active-parent" : ""}`}
                onClick={() => toggleParent(parent.id)}
              >
                <span className="chev">▶</span>
                {parent.label}
              </button>

              {isExpanded && parent.children && (
                <div className="house-tree-children">
                  {parent.children.map((child) => {
                    const isSelected = selectedId === child.id;
                    return (
                      <button
                        key={child.id}
                        type="button"
                        className={`house-tree-child ${isSelected ? "selected" : ""}`}
                        onClick={() => handleSelect(child.id, parent.id)}
                      >
                        {child.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Right Content */}
      <div className="house-content">
        {renderContent && renderContent(selectedId)}
      </div>
    </div>
  );
}