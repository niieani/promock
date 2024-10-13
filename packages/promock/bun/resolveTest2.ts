export const b = { b: 123 };

//artificial delay to test async loading
// await new Promise((resolve) => setTimeout(resolve, 1000));
export const goFn = async () => {
  const { go } = await import("./go.js");
  return go;
};
