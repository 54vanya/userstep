export function Cursor() {
  return (
    <div className="sticky top-0 z-20 h-0 pointer-events-none overflow-visible">
      <div
        className="absolute left-0 right-0 h-px bg-red-500/70"
        style={{ top: 40 }}
      />
      <div
        className="absolute text-red-400 text-[10px] leading-none"
        style={{ top: 28, left: 2 }}
      >
        ▶
      </div>
    </div>
  )
}
