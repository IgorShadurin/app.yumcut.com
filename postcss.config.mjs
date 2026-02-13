const plugins = process.env.VITEST ? [] : ['@tailwindcss/postcss'];

export default {
  plugins,
};
