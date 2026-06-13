export function Cursor({ cursorY }: { cursorY: number }) {
  return (
    <div className="sticky top-0 z-20 h-0 pointer-events-none overflow-visible">
      <div
        className="absolute left-0 right-0 h-px bg-red-500/70"
        style={{ top: cursorY }}
      />
    </div>
  )
}
