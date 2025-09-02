// ESM loader to stub ink-syntax-highlight for node:test terminal runs
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'ink-syntax-highlight') {
    const code = `export default function SyntaxHighlight({code}) { return String(code ?? ''); }\n`;
    const url = 'data:text/javascript;base64,' + Buffer.from(code, 'utf8').toString('base64');
    return {url, shortCircuit: true};
  }
  return nextResolve(specifier, context);
}
