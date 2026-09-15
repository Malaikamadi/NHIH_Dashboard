export function DeskDeleteButton({
  label,
  onDelete,
}: {
  label: string
  onDelete: () => void
}) {
  return (
    <button
      type="button"
      className="desk-delete"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (window.confirm(`Delete “${label}”? This cannot be undone.`)) onDelete()
      }}
    >
      Delete
    </button>
  )
}
