const codesFile = "./database/codes.3.txt"
let codes: number[] = []

/**
 * Converts an index to a 3 letter code
 * @param {number} index 
 * @returns A 3 letter code
 */
function indexToCombination(index: number): string {
  const firstChar = String.fromCharCode(65 + Math.floor(index / (26 * 26)) % 26);
  const secondChar = String.fromCharCode(65 + Math.floor(index / 26) % 26);
  const thirdChar = String.fromCharCode(65 + index % 26);
  return `${firstChar}${secondChar}${thirdChar}`;
}

/**
 * Convert a 3 letter code to its corresponding index.
 * 
 * @param combination - The three-letter combination (e.g., "AAA", "ZZZ").
 * @returns The index of the combination in the range [0, 17575].
 */
function combinationToIndex(combination: string): number {
  const firstCharIndex = combination.charCodeAt(0) - 65; // 'A' -> 0, 'Z' -> 25
  const secondCharIndex = combination.charCodeAt(1) - 65;
  const thirdCharIndex = combination.charCodeAt(2) - 65;
  return firstCharIndex * 26 * 26 + secondCharIndex * 26 + thirdCharIndex;
}

/**
 * Initialize the codes file
 */
function initCodes() {
  codes = Array.from({ length: 26**3 }, (_, i) => i);
  codes.sort(() => Math.random() - 0.5);
  const writer = Bun.file(codesFile).writer();
  for (const i of codes) {
    const combination = indexToCombination(i);
    writer.write(combination);
  }
  writer.end()
}

/**
 * Initialize codes from file
 */
async function readCodesFromFile() {
  for(let i = 0; i <= Bun.file(codesFile).size - 1; i += 3) {
    const str = await Bun.file(codesFile).slice(i, i+3).text()
    codes.push(combinationToIndex(str))
  }
}

export async function initCodesFile() {
  if(!await Bun.file(codesFile).exists())
    initCodes();
  else
    readCodesFromFile();
}

/**
 * Random Shortlink Path Generator
 * @returns String - A random 3 letter code
 */
export async function generateCode(): Promise<string> {
  const i = codes.shift()
  if(i){
    const code = indexToCombination(i)
    const text = await Bun.file(codesFile).text()
    Bun.write(Bun.file(codesFile), text.slice(3))
    return code;
  }
  return ""; //Figure out error case here. DB Full! Out of codes!
}