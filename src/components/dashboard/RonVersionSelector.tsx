// Legacy RonVersionSelector — only Falconer v7 TP3 runs now. Type kept for old imports.
export type RonVersion = "falconer_v7";
interface Props { userId?: string; onVersionChange?: (v: RonVersion) => void }
export default function RonVersionSelector(_props: Props) {
  return null;
}