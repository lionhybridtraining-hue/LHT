export default function splitStringFormatted(input: string): string {
  const regex = /\)\d+/g;
  const match = regex.exec(input);

  if (match) {
    const splitIndex = match.index + 1; // Include the ")"
    return input.slice(0, splitIndex);
  }

  // If no match, return the whole input
  return input[0];
}
