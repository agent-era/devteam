// Utility to map file names/extensions to languages for syntax highlighting

export const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  cpp: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  swift: 'swift',
  kt: 'kotlin',
  scala: 'scala',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'bash',
  ps1: 'powershell',
  json: 'json',
  xml: 'xml',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  sql: 'sql',
  md: 'markdown',
  markdown: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'toml',
  dockerfile: 'dockerfile',
  makefile: 'makefile',
  cmake: 'cmake',
  vim: 'vim',
  lua: 'lua',
  r: 'r',
  R: 'r',
  dart: 'dart',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'erlang',
  hrl: 'erlang',
  fs: 'fsharp',
  fsx: 'fsharp',
  ml: 'ocaml',
  mli: 'ocaml',
  clj: 'clojure',
  cljs: 'clojure',
  elm: 'elm',
  jl: 'julia',
  nim: 'nim',
  nix: 'nix',
  hs: 'haskell',
  pl: 'perl',
  pm: 'perl',
  tcl: 'tcl',
  vb: 'vbnet',
  pas: 'pascal',
  pp: 'pascal',
  proto: 'protobuf',
  tf: 'hcl',
  tfvars: 'hcl',
  hcl: 'hcl',
  zig: 'zig',
  v: 'v',
  vala: 'vala',
  ada: 'ada',
  adb: 'ada',
  ads: 'ada',
  asm: 'x86asm',
  s: 'x86asm',
};

export function getLanguageFromFileName(fileName: string | undefined): string {
  if (!fileName) return 'plaintext';

  const ext = fileName.split('.').pop()?.toLowerCase();

  // Special cases for specific filenames without extensions
  const baseName = fileName.split('/').pop()?.toLowerCase();
  if (baseName === 'dockerfile' || baseName === 'containerfile') return 'dockerfile';
  if (baseName === 'makefile' || baseName === 'gnumakefile') return 'makefile';
  if (baseName === 'cmakelists.txt') return 'cmake';
  if (baseName === 'rakefile') return 'ruby';
  if (baseName === 'gemfile') return 'ruby';
  if (baseName === 'podfile') return 'ruby';
  if (baseName === 'vagrantfile') return 'ruby';
  if (baseName === 'brewfile') return 'ruby';
  if (baseName === 'guardfile') return 'ruby';
  if (baseName === 'capfile') return 'ruby';
  if (baseName === 'thorfile') return 'ruby';
  if (baseName === 'berksfile') return 'ruby';
  if (baseName === 'pryrc') return 'ruby';
  if (baseName === '.gitignore' || baseName === '.dockerignore') return 'properties';
  if (baseName === '.env' || baseName?.startsWith('.env.')) return 'properties';

  return LANGUAGE_MAP[ext || ''] || 'plaintext';
}

