// Placeholder neuron layout API module.
// This file exists to keep TypeScript diagnostics clean for concept assets.

export type NeuronConceptStatus = {
  ready: boolean;
  note?: string;
};

export function getNeuronConceptStatus(): NeuronConceptStatus {
  return {
    ready: false,
    note: "Concept-only layout: no runtime API implemented.",
  };
}
