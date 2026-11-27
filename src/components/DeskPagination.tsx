import { useState } from 'react'

export function useDeskPagination<T>(items: T[], resetKey = '') {
  const [selection, setSelection] = useState({ key: '', page: 1 })
  const pages = Math.max(1, Math.ceil(items.length / 10))
  const page = Math.min(selection.key === resetKey ? selection.page : 1, pages)
  return { items: items.slice((page - 1) * 10, page * 10), page, pages, total: items.length, onPage: (next: number) => setSelection({ key: resetKey, page: next }) }
}

export function DeskPagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (page: number) => void }) {
  if (total <= 10) return null
  return <nav aria-label="Record pages" style={{display:'flex',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:12,padding:'16px 0'}}>
    <span className="muted">Showing {(page-1)*10+1}–{Math.min(page*10,total)} of {total}</span>
    <div style={{display:'flex',alignItems:'center',gap:10}}>
      <button type="button" className="ghost-btn" disabled={page===1} onClick={()=>onPage(page-1)}>Previous</button>
      <span>{page} / {pages}</span>
      <button type="button" className="ghost-btn" disabled={page===pages} onClick={()=>onPage(page+1)}>Next</button>
    </div>
  </nav>
}
