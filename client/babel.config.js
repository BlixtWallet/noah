module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { jsxImportSource: "nativewind" }], "nativewind/babel"],
    plugins: [
      [
        "babel-plugin-react-compiler",
        {
          logger: {
            logEvent: (filename, event) => {
              if (event.kind === "CompileSuccess") {
                console.log("✨ React Compiler successfully compiled: ", filename);
              }

              if (event.kind === "CompileError") {
                console.warn("⚠️ React Compiler failed to compile: " + filename);
                console.warn(filename, JSON.stringify(event, null, 2));
              }
            },
          },
        },
      ],
      "react-native-reanimated/plugin",
    ],
  };
};
