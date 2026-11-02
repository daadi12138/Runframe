export default function NotFound() {
  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100vh', color: '#94a3b8', background: '#080c14' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#f8fafc', marginBottom: '8px' }}>404 - 页面未找到</h1>
        <p style={{ fontSize: '14px', color: '#64748b' }}>所请求的页面不存在或已被移动。</p>
        <a href="/" style={{ display: 'inline-block', marginTop: '16px', color: '#818cf8', textDecoration: 'none' }}>返回任务中枢</a>
      </div>
    </div>
  )
}
