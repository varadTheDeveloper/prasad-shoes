// Orders picked on the Orders screen, handed to the Download labels screen (kept in memory only).
let selected: number[] = [];
export const setSelection = (ids: number[]) => {
  selected = [...ids];
};
export const getSelection = () => selected;
