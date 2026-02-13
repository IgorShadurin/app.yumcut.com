export const PLACEHOLDERS: string[] = [
  "Make a video explaining who invented toothpaste",
  "Make a video explaining who created the first computer",
  "Make a video explaining who invented the telephone",
  "Make a video explaining who developed the internet",
  "Make a video explaining who created pizza",
  "Make a video explaining who invented the light bulb",
  "Make a video explaining who created chocolate",
  "Make a video explaining who invented the airplane",
  "Make a video explaining who developed vaccines",
  "Make a video explaining who created the first car",
  "Make a video explaining who invented coffee brewing",
  "Make a video explaining who created the first camera",
  "Make a video explaining who invented ice cream",
  "Make a video explaining who developed antibiotics",
  "Make a video explaining who created the first bicycle",
  "Make a video explaining who invented the zipper",
  "Make a video explaining who created jeans",
  "Make a video explaining who invented the microwave",
  "Make a video explaining who developed GPS technology",
  "Make a video explaining who created the first video game",
];

export function pickRandomPlaceholder(): string {
  const idx = Math.floor(Math.random() * PLACEHOLDERS.length);
  return PLACEHOLDERS[idx];
}

