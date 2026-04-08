import { useState, useEffect, useRef, useMemo } from 'react'
import * as d3 from 'd3'
import ARTICLES from './articles.json'
import TICKERS from './tickers.json'
import BANKRUPT from './bankrupt.json'
import BLOGS from './blogs.json'
import LAWS from './laws.json'

const THEMES = [
  { label:"Securities Fraud",       color:"#C04A1E", bg:"#FDF0EB", icon:"⚖️" },
  { label:"Insider Trading",        color:"#9A6010", bg:"#FDF5E6", icon:"🤫" },
  { label:"Musk / Tesla / SpaceX",  color:"#1455A0", bg:"#EAF3FC", icon:"🚀" },
  { label:"M&A / Mergers",          color:"#0D6048", bg:"#E8F7F2", icon:"🤝" },
  { label:"Crypto / Blockchain",    color:"#4840A0", bg:"#EEEDF8", icon:"₿" },
  { label:"OpenAI / AI",            color:"#882E50", bg:"#FAE9F0", icon:"🤖" },
  { label:"Fed / Central Banks",    color:"#336010", bg:"#EBF5DE", icon:"🏦" },
  { label:"IPOs / Capital Markets", color:"#1A5FA0", bg:"#EAF3FC", icon:"📈" },
  { label:"Legal / Courts",         color:"#505048", bg:"#F2F2EE", icon:"👨‍⚖️" },
  { label:"Hedge Funds / PE",       color:"#882818", bg:"#FDF0EB", icon:"💰" },
  { label:"Regulation / SEC",       color:"#784810", bg:"#FDF5E6", icon:"📋" },
  { label:"Banking / Crises",       color:"#902828", bg:"#FBECEC", icon:"🏧" },
  { label:"Bankruptcy",             color:"#5A3080", bg:"#F3EEF8", icon:"📉" },
  { label:"Corporate Governance",   color:"#1A8060", bg:"#E8F7F2", icon:"🏢" },
  { label:"Options / Derivatives",  color:"#6058B0", bg:"#EEEDF8", icon:"📊" },
]
const TM = Object.fromEntries(THEMES.map(t => [t.label, t]))
const TODAY = '2026-04-08'
const publishedBlogs = BLOGS.filter(b => b.publish_date <= TODAY)

// ── Helpers ─────────────────────────────────────────────────────────────────
function ThemePill({ theme, small, onClick }) {
  const t = TM[theme]; if (!t) return null
  return <span onClick={onClick} style={{display:'inline-block',fontSize:small?10:11,padding:small?'1px 6px':'2px 9px',borderRadius:20,background:t.bg,color:t.color,fontWeight:500,whiteSpace:'nowrap',cursor:onClick?'pointer':'default',lineHeight:1.6}}>{theme}</span>
}
function ReturnBadge({ pct }) {
  if (pct == null) return null
  const pos = pct >= 0
  return <span style={{fontSize:11,fontWeight:600,padding:'1px 7px',borderRadius:4,background:pos?'#EBF5DE':'#FBECEC',color:pos?'#336010':'#902828'}}>{pos?'+':''}{pct.toFixed(0)}%</span>
}

// ── Bubble Chart ─────────────────────────────────────────────────────────────
function BubbleChart({ selected, onSelect }) {
  const containerRef = useRef()
  const svgRef = useRef()
  const counts = useMemo(() => {
    const c = Object.fromEntries(THEMES.map(t => [t.label, 0]))
    ARTICLES.forEach(a => (a.themes||[]).forEach(th => { if (c[th]!==undefined) c[th]++ }))
    return c
  }, [])

  useEffect(() => {
    const container = containerRef.current
    const svg = svgRef.current
    if (!container || !svg) return

    const W = container.clientWidth || 860
    const H = Math.max(460, Math.round(W * 0.55))
    const data = THEMES.map(t => ({ ...t, count: counts[t.label]||0 }))

    const pack = d3.pack().size([W, H]).padding(5)
    const root = d3.hierarchy({ children: data }).sum(d => d.count + 8)
    pack(root)

    const sel = d3.select(svg)
    sel.selectAll('*').remove()
    sel.attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', H)

    const defs = sel.append('defs')
    root.leaves().forEach((d, i) => {
      defs.append('clipPath').attr('id', `bc-${i}`)
        .append('circle').attr('cx', d.x).attr('cy', d.y).attr('r', Math.max(0, d.r - 1.5))
    })

    root.leaves().forEach((d, i) => {
      const isSelected = selected === d.data.label
      const dimmed = selected && !isSelected

      const g = sel.append('g')
        .attr('cursor', 'pointer')
        .attr('opacity', dimmed ? 0.28 : 1)
        .on('click', () => onSelect(isSelected ? null : d.data.label))

      g.append('circle')
        .attr('cx', d.x).attr('cy', d.y).attr('r', d.r)
        .attr('fill', d.data.bg)
        .attr('stroke', d.data.color)
        .attr('stroke-width', isSelected ? 3 : 1.5)

      const r = d.r
      const textG = g.append('g').attr('clip-path', `url(#bc-${i})`)

      // Split label into two lines at slash or space boundary
      const label = d.data.label
      let line1 = label, line2 = ''
      if (r > 38) {
        const slashIdx = label.indexOf(' / ')
        if (slashIdx > 0) { line1 = label.slice(0, slashIdx); line2 = label.slice(slashIdx + 1) }
        else {
          const words = label.split(' ')
          if (words.length >= 2) {
            const mid = Math.ceil(words.length / 2)
            line1 = words.slice(0, mid).join(' ')
            line2 = words.slice(mid).join(' ')
          }
        }
      }

      const hasCount = r > 30
      const hasTwoLines = line2 && r > 38
      const fontSize = Math.min(r * 0.30, 15)
      const countSize = Math.min(r * 0.22, 11)

      if (r < 22) return // too small, no text

      if (hasTwoLines) {
        const totalH = fontSize * 2 * 1.2 + (hasCount ? countSize * 1.4 : 0)
        const topY = d.y - totalH / 2 + fontSize * 0.8

        textG.append('text')
          .attr('x', d.x).attr('y', topY)
          .attr('text-anchor', 'middle').attr('font-size', fontSize)
          .attr('fill', d.data.color).attr('font-weight', '600')
          .attr('font-family', 'Inter,sans-serif')
          .text(line1)

        textG.append('text')
          .attr('x', d.x).attr('y', topY + fontSize * 1.25)
          .attr('text-anchor', 'middle').attr('font-size', fontSize)
          .attr('fill', d.data.color).attr('font-weight', '600')
          .attr('font-family', 'Inter,sans-serif')
          .text(line2)

        if (hasCount) {
          textG.append('text')
            .attr('x', d.x).attr('y', topY + fontSize * 2.6)
            .attr('text-anchor', 'middle').attr('font-size', countSize)
            .attr('fill', d.data.color).attr('opacity', 0.65)
            .attr('font-family', 'Inter,sans-serif')
            .text(d.data.count)
        }
      } else {
        const labelY = hasCount ? d.y - countSize * 0.8 : d.y + fontSize * 0.35

        textG.append('text')
          .attr('x', d.x).attr('y', labelY)
          .attr('text-anchor', 'middle').attr('font-size', fontSize)
          .attr('fill', d.data.color).attr('font-weight', '600')
          .attr('font-family', 'Inter,sans-serif')
          .text(r < 36 ? (label.split(' ')[0]) : label)

        if (hasCount) {
          textG.append('text')
            .attr('x', d.x).attr('y', labelY + fontSize * 1.3)
            .attr('text-anchor', 'middle').attr('font-size', countSize)
            .attr('fill', d.data.color).attr('opacity', 0.65)
            .attr('font-family', 'Inter,sans-serif')
            .text(d.data.count)
        }
      }
    })
  }, [selected, counts])

  return (
    <div ref={containerRef} style={{width:'100%'}}>
      <svg ref={svgRef} style={{width:'100%',display:'block'}} />
    </div>
  )
}

// ── Article drawer ────────────────────────────────────────────────────────────
function ArticleDrawer({ article, onClose }) {
  if (!article) return null
  const t = TM[article.themes?.[0]]
  const blog = publishedBlogs.find(b => article.themes?.includes(b.theme))
  return (
    <div style={{position:'fixed',right:0,top:0,height:'100vh',width:'min(460px,100vw)',background:'#fff',borderLeft:'1px solid #EAEAE4',zIndex:200,overflowY:'auto',display:'flex',flexDirection:'column'}}>
      <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #EAEAE4',display:'flex',alignItems:'flex-start',gap:12}}>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'#aaa',marginBottom:4}}>{article.d} · {article.w?.toLocaleString()} words</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:500,lineHeight:1.4,margin:0}}>{article.t}</h2>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,color:'#bbb',cursor:'pointer',padding:0,lineHeight:1,flexShrink:0}}>×</button>
      </div>
      <div style={{padding:'1.25rem',flex:1}}>
        {article.themes?.length>0 && <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>{article.themes.map(th=><ThemePill key={th} theme={th}/>)}</div>}
        {article.lesson && (
          <div style={{background:'#FAFAF4',borderLeft:`3px solid ${t?.color||'#ccc'}`,padding:'12px 16px',borderRadius:'0 8px 8px 0',marginBottom:16}}>
            <div style={{fontSize:10,fontWeight:600,color:t?.color||'#888',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Key passage</div>
            <div style={{fontSize:13,lineHeight:1.75,fontStyle:'italic',color:'#333'}}>"{article.lesson}"</div>
          </div>
        )}
        {article.summary && article.summary !== article.lesson && (
          <p style={{fontSize:13,color:'#555',lineHeight:1.7,marginBottom:16}}>{article.summary}</p>
        )}
        {blog && (
          <div style={{background:'#F7F4FF',borderRadius:8,padding:'10px 14px',marginBottom:16}}>
            <div style={{fontSize:10,fontWeight:600,color:'#6058B0',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Related deep-dive</div>
            <div style={{fontSize:12,color:'#333',fontWeight:500,lineHeight:1.4}}>{blog.title.replace('Here Is How ','').replace(', According to Matt Levine','')}</div>
          </div>
        )}
        <a href={article.u} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,color:'#1455A0',textDecoration:'none',padding:'8px 16px',border:'1px solid #1455A0',borderRadius:6}}>
          Read full issue ↗
        </a>
      </div>
    </div>
  )
}

// ── Article row ───────────────────────────────────────────────────────────────
function ArticleRow({ a, selected, onClick }) {
  const t = TM[a.themes?.[0]]
  return (
    <div onClick={onClick}
      style={{padding:'10px 0',borderBottom:'1px solid #EEEEE8',cursor:'pointer',
        borderLeft:selected?`3px solid ${t?.color||'#999'}`:'3px solid transparent',
        paddingLeft:selected?10:0,background:selected?'#FAFAF4':'transparent'}}
      onMouseEnter={e=>{if(!selected)e.currentTarget.style.background='#F7F7F2'}}
      onMouseLeave={e=>{if(!selected)e.currentTarget.style.background='transparent'}}>
      <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'#aaa',whiteSpace:'nowrap',paddingTop:2,width:72,flexShrink:0}}>{a.d}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:500,lineHeight:1.4,marginBottom:3}}>{a.t}</div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{(a.themes||[]).map(th=><ThemePill key={th} theme={th} small/>)}</div>
        </div>
        <span style={{fontSize:10,color:'#bbb',whiteSpace:'nowrap',flexShrink:0}}>{Math.round(a.w/200)}m</span>
      </div>
    </div>
  )
}

// ── Blog post reader ──────────────────────────────────────────────────────────
function BlogPost({ blog, onBack, isMobile = false }) {
  const t = TM[blog.theme]
  return (
    <div style={{maxWidth:700}}>
      <button onClick={onBack} style={{fontSize:12,color:'#888',border:'none',background:'none',padding:'0 0 1.5rem',cursor:'pointer',display:'block'}}>← Blog</button>
      <div style={{marginBottom:'2rem'}}>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
          <ThemePill theme={blog.theme}/>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'#aaa'}}>{blog.publish_date} · {blog.article_count} source articles</span>
        </div>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?20:26,fontWeight:600,lineHeight:1.3,marginBottom:10,letterSpacing:'-0.01em'}}>{blog.title}</h1>
        <p style={{fontSize:16,color:'#666',fontStyle:'italic'}}>{blog.subtitle}</p>
      </div>
      <div style={{borderTop:'2px solid #1a1a18',paddingTop:'1.5rem',marginBottom:'2rem'}}>
        {blog.intro.split('\n\n').map((p,i)=><p key={i} style={{fontSize:15,lineHeight:1.85,color:'#333',marginBottom:'1rem'}}>{p}</p>)}
      </div>
      {blog.sections?.map((s,i) => (
        <div key={i} style={{marginBottom:'2.5rem'}}>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:19,fontWeight:500,lineHeight:1.4,marginBottom:'1rem',borderLeft:`3px solid ${t?.color||'#ccc'}`,paddingLeft:14}}>{s.heading}</h2>
          <blockquote style={{margin:'0 0 1.25rem',padding:'1.25rem 1.5rem',background:t?.bg||'#f8f8f4',borderLeft:`4px solid ${t?.color||'#ccc'}`,borderRadius:'0 10px 10px 0'}}>
            <p style={{fontFamily:"'Playfair Display',serif",fontSize:15,lineHeight:1.9,fontStyle:'italic',color:'#333',margin:'0 0 10px'}}>"{s.quote}"</p>
            <footer style={{fontFamily:"Inter,sans-serif",fontSize:11,color:'#888'}}>
              — <a href={s.quote_url} target="_blank" rel="noreferrer" style={{color:t?.color||'#666',textDecoration:'none',fontWeight:500}}>{s.quote_title}</a>
              {s.quote_date && ` · ${s.quote_date}`}
            </footer>
          </blockquote>
          {s.commentary.split('\n\n').map((p,j)=><p key={j} style={{fontSize:14,lineHeight:1.85,color:'#444',marginBottom:'0.875rem'}}>{p}</p>)}
        </div>
      ))}
      <div style={{borderTop:'2px solid #1a1a18',paddingTop:'1.5rem',marginBottom:'1.5rem'}}>
        {blog.conclusion?.split('\n\n').map((p,i)=><p key={i} style={{fontSize:15,lineHeight:1.85,color:'#333',marginBottom:'1rem'}}>{p}</p>)}
      </div>
      {blog.key_insight && (
        <div style={{background:'#1a1a18',color:'#fff',borderRadius:10,padding:'1.25rem 1.5rem',fontSize:15,fontStyle:'italic',lineHeight:1.7}}>
          "{blog.key_insight}"
        </div>
      )}
    </div>
  )
}

// ── Sidebar nav ───────────────────────────────────────────────────────────────
const NAV = [
  { id:'themes',   label:'Themes',   icon:'◉' },
  { id:'laws',     label:'Laws',     icon:'§' },
  { id:'tickers',  label:'Tickers',  icon:'$' },
  { id:'articles', label:'Articles', icon:'≡' },
  { id:'blog',     label:'Blog',     icon:'✦', badge: publishedBlogs.length },
]

// ── Mobile detection ─────────────────────────────────────────────────────────
function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 768)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

// ── Hash routing ──────────────────────────────────────────────────────────────
function parseHash() {
  const h = window.location.hash.replace('#/', '').replace('#', '')
  if (h.startsWith('blog/')) return { tab: 'blog', slug: h.slice(5) }
  if (['laws','tickers','articles','blog'].includes(h)) return { tab: h, slug: null }
  return { tab: 'themes', slug: null }
}

export default function App() {
  const isMobile = useIsMobile()
  const [tab, setTab] = useState(() => parseHash().tab)
  const [selectedTheme, setSelectedTheme] = useState(null)
  const [drawerArticle, setDrawerArticle] = useState(null)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('all')
  const [activeBlog, setActiveBlog] = useState(() => {
    const { slug } = parseHash()
    return slug ? (publishedBlogs.find(b => b.slug === slug) || null) : null
  })
  const [expandedTicker, setExpandedTicker] = useState(null)

  useEffect(() => {
    const handler = () => {
      const { tab: t, slug } = parseHash()
      setTab(t)
      setActiveBlog(slug ? (publishedBlogs.find(b => b.slug === slug) || null) : null)
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  const years = useMemo(() => ['all',...[...new Set(ARTICLES.map(a=>a.d?.slice(0,4)).filter(Boolean))].sort().reverse()],[])
  const themeCounts = useMemo(() => {
    const c = Object.fromEntries(THEMES.map(t => [t.label, 0]))
    ARTICLES.forEach(a => (a.themes||[]).forEach(th => { if(c[th]!==undefined) c[th]++ }))
    return c
  }, [])
  const filtered = useMemo(() => ARTICLES.filter(a => {
    if (year!=='all' && !a.d?.startsWith(year)) return false
    if (search) {
      const q = search.toLowerCase()
      if (!a.t.toLowerCase().includes(q) && !a.lesson?.toLowerCase().includes(q)) return false
    }
    if (selectedTheme && !a.themes?.includes(selectedTheme)) return false
    return true
  }).slice(0, 400), [year, search, selectedTheme])

  useEffect(() => {
    document.body.style.overflow = drawerArticle ? 'hidden' : 'auto'
    return () => { document.body.style.overflow = 'auto' }
  }, [drawerArticle])

  const handleTabChange = (id) => {
    setTab(id)
    if (id !== 'blog') { setActiveBlog(null); window.location.hash = id === 'themes' ? '' : '/' + id }
  }
  const openBlog = (blog) => {
    setActiveBlog(blog)
    setTab('blog')
    window.location.hash = '/blog/' + blog.slug
  }

  // ── Shared content pages ──────────────────────────────────────────────────
  const ThemesPage = () => (
    <div>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?20:24,fontWeight:500,marginBottom:6}}>Themes</h1>
      <p style={{fontSize:13,color:'#777',lineHeight:1.7,marginBottom:'1rem'}}>
        {ARTICLES.length} issues across {THEMES.length} themes. Tap a bubble or card to filter.
      </p>
      <div style={{background:'#fff',border:'1px solid #EAEAE4',borderRadius:12,padding:'0.75rem',marginBottom:'1rem'}}>
        <div style={{fontSize:11,color:'#aaa',marginBottom:6}}>
          Bubble size = article count.{selectedTheme && <span style={{marginLeft:6,color:TM[selectedTheme]?.color,fontWeight:500}}>{selectedTheme} · <span style={{cursor:'pointer',textDecoration:'underline'}} onClick={()=>setSelectedTheme(null)}>clear</span></span>}
        </div>
        <BubbleChart selected={selectedTheme} onSelect={setSelectedTheme}/>
      </div>
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(260px,1fr))',gap:8}}>
        {THEMES.map(th => {
          const count = themeCounts[th.label]||0
          const blog = publishedBlogs.find(b=>b.theme===th.label)
          const topLesson = ARTICLES.find(a=>a.themes?.includes(th.label)&&a.lesson?.length>50)
          return (
            <div key={th.label}
              style={{background:'#fff',border:'1px solid #EAEAE4',borderRadius:10,padding:'0.875rem',cursor:'pointer',borderTop:`3px solid ${th.color}`,opacity:selectedTheme&&selectedTheme!==th.label?0.4:1,transition:'opacity 0.2s',userSelect:'none',WebkitTapHighlightColor:'transparent'}}
              onClick={()=>setSelectedTheme(selectedTheme===th.label?null:th.label)}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:topLesson?6:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:18}}>{th.icon}</span>
                  <span style={{fontSize:13,fontWeight:500}}>{th.label}</span>
                </div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <span style={{fontSize:11,color:'#aaa'}}>{count}</span>
                  {blog && <span onClick={e=>{e.stopPropagation();openBlog(blog)}} style={{fontSize:10,padding:'1px 7px',borderRadius:10,background:th.bg,color:th.color,fontWeight:500,cursor:'pointer'}}>Blog ↗</span>}
                </div>
              </div>
              {topLesson && !isMobile && (
                <div style={{borderTop:'1px solid #EEEEE8',paddingTop:6,marginTop:4}}>
                  <div style={{fontSize:11,fontStyle:'italic',color:'#777',lineHeight:1.5}}>"{topLesson.lesson.slice(0,90)}{topLesson.lesson.length>90?'…':''}"</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {selectedTheme && (
        <div style={{marginTop:'1.5rem'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:500,margin:0}}>{selectedTheme}</h2>
            <button onClick={()=>setTab('articles')} style={{fontSize:12,color:'#666'}}>All →</button>
          </div>
          {ARTICLES.filter(a=>a.themes?.includes(selectedTheme)).slice(0,6).map(a=>(
            <ArticleRow key={a.id} a={a} selected={drawerArticle?.id===a.id} onClick={()=>setDrawerArticle(d=>d?.id===a.id?null:a)}/>
          ))}
          {ARTICLES.filter(a=>a.themes?.includes(selectedTheme)).length>6 && (
            <div style={{textAlign:'center',padding:'0.75rem',fontSize:12,color:'#888'}}>
              +{ARTICLES.filter(a=>a.themes?.includes(selectedTheme)).length-6} more · <span style={{color:'#1455A0',cursor:'pointer'}} onClick={()=>setTab('articles')}>view all</span>
            </div>
          )}
        </div>
      )}
    </div>
  )

  const LawsPage = () => (
    <div>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?20:24,fontWeight:500,marginBottom:6}}>The Laws of Insider Trading</h1>
      <p style={{fontSize:13,color:'#777',lineHeight:1.7,marginBottom:'1.5rem'}}>Matt Levine has been adding to this list since 2016. None of it is legal advice.</p>
      {LAWS.map(l => (
        <div key={l.number} style={{display:'flex',gap:isMobile?14:24,marginBottom:'1.5rem',paddingBottom:'1.5rem',borderBottom:'1px solid #EEEEE8'}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?30:42,fontWeight:700,color:'#ccc',flexShrink:0,width:isMobile?36:52,textAlign:'center',lineHeight:1,paddingTop:2}}>{l.number}</div>
          <div style={{paddingTop:4}}>
            <p style={{fontSize:isMobile?14:15,lineHeight:1.75,color:'#1a1a18',marginBottom:6,fontStyle:l.number===1?'italic':'normal',fontWeight:l.number===1?500:400}}>{l.description}</p>
            <a href={l.article_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:'#aaa',textDecoration:'none'}}>— {l.article_title} · {l.article_date}</a>
          </div>
        </div>
      ))}
      <p style={{fontSize:12,color:'#bbb',fontStyle:'italic'}}>None of this is legal advice. Probably put that at the top of your spreadsheet.</p>
    </div>
  )

  const TickersPage = () => (
    <div>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?20:24,fontWeight:500,marginBottom:6}}>Tickers</h1>
      <p style={{fontSize:13,color:'#777',lineHeight:1.7,marginBottom:'1.25rem'}}>Return since Matt first wrote about them. Plus companies that went bankrupt.</p>
      <div style={{marginBottom:'2rem'}}>
        <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Active — return since first mention</div>
        {[...TICKERS].sort((a,b)=>b.return_pct-a.return_pct).map(t => (
          <div key={t.ticker} style={{background:'#fff',border:'1px solid #EAEAE4',borderRadius:10,padding:'12px',marginBottom:6,cursor:'pointer',WebkitTapHighlightColor:'transparent'}} onClick={()=>setExpandedTicker(expandedTicker===t.ticker?null:t.ticker)}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:42,height:42,borderRadius:8,background:t.return_pct>=0?'#EBF5DE':'#FBECEC',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,fontSize:10,color:t.return_pct>=0?'#336010':'#902828'}}>{t.ticker}</span>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,color:'#666',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>First: <strong style={{color:'#333'}}>{t.first_date}</strong> · {t.mention_count}×</div>
                {!isMobile && <div style={{fontSize:10,color:'#aaa',marginTop:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.mentions?.[0]?.t?.slice(0,45)}…</div>}
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                {!isMobile && <div style={{fontSize:11,color:'#888',marginBottom:2}}>${t.price_then} → <strong>${t.price_now}</strong></div>}
                <ReturnBadge pct={t.return_pct}/>
              </div>
            </div>
            {expandedTicker===t.ticker && (
              <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #EEEEE8'}}>
                <div style={{fontSize:11,color:'#888',marginBottom:2}}>${t.price_then} → ${t.price_now} · {t.mention_count} mentions</div>
                {t.mentions?.slice(0,4).map((m,i)=><div key={i} style={{fontSize:11,padding:'2px 0',color:'#555'}}><span style={{fontFamily:"'JetBrains Mono',monospace",color:'#aaa',marginRight:6}}>{m.d}</span>{m.t}</div>)}
              </div>
            )}
          </div>
        ))}
      </div>
      <div>
        <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Companies that went bankrupt</div>
        {BANKRUPT.map(b => (
          <div key={b.ticker} style={{background:'#fff',border:'1px solid #F2E8E8',borderLeft:'3px solid #902828',borderRadius:10,padding:'12px',marginBottom:6,cursor:'pointer',WebkitTapHighlightColor:'transparent'}} onClick={()=>setExpandedTicker(expandedTicker===b.ticker?null:b.ticker)}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:42,height:42,borderRadius:8,background:'#FBECEC',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,fontSize:10,color:'#902828'}}>{b.ticker}</span>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                  <strong style={{fontSize:13}}>{b.name}</strong>
                  <span style={{fontSize:9,padding:'1px 5px',borderRadius:4,background:'#902828',color:'#fff',fontWeight:700}}>BANKRUPT</span>
                </div>
                <div style={{fontSize:11,color:'#aaa'}}>{b.bankruptcy_date} · {b.mention_count}× archived</div>
              </div>
            </div>
            {expandedTicker===b.ticker && (
              <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #F2E8E8'}}>
                <p style={{fontSize:12,color:'#666',lineHeight:1.6,marginBottom:6}}>{b.note}</p>
                {b.mentions?.slice(0,4).map((m,i)=><div key={i} style={{fontSize:11,padding:'2px 0',color:'#555'}}><span style={{fontFamily:"'JetBrains Mono',monospace",color:'#aaa',marginRight:6}}>{m.d}</span>{m.t}</div>)}
              </div>
            )}
          </div>
        ))}
        <p style={{fontSize:11,color:'#bbb',marginTop:'1rem'}}>Prices via Yahoo Finance, refreshed daily. Not financial advice.</p>
      </div>
    </div>
  )

  const ArticlesPage = () => (
    <div>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?20:24,fontWeight:500,marginBottom:10}}>Articles</h1>
      <div style={{display:'flex',gap:6,marginBottom:'0.75rem',flexWrap:'wrap'}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{flex:'1 1 140px',minWidth:0,fontSize:13}}/>
        <select value={year} onChange={e=>setYear(e.target.value)} style={{fontSize:13,flex:'0 0 auto'}}>
          {years.map(y=><option key={y} value={y}>{y==='all'?'All years':y}</option>)}
        </select>
        <select value={selectedTheme||''} onChange={e=>setSelectedTheme(e.target.value||null)} style={{fontSize:13,flex:'1 1 120px',minWidth:0}}>
          <option value=''>All themes</option>
          {THEMES.map(t=><option key={t.label} value={t.label}>{t.label}</option>)}
        </select>
        {(selectedTheme||search||year!=='all') && <button onClick={()=>{setSelectedTheme(null);setSearch('');setYear('all')}} style={{fontSize:11,color:'#888'}}>Clear</button>}
      </div>
      <div style={{fontSize:11,color:'#aaa',marginBottom:6}}>{filtered.length}{filtered.length===400?' (max 400)':''} articles</div>
      {filtered.map(a=>(
        <ArticleRow key={a.id} a={a} selected={drawerArticle?.id===a.id} onClick={()=>setDrawerArticle(d=>d?.id===a.id?null:a)}/>
      ))}
      {!filtered.length && <div style={{textAlign:'center',padding:'3rem',color:'#aaa'}}>No results.</div>}
    </div>
  )

  const BlogListPage = () => (
    <div>
      <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:isMobile?20:24,fontWeight:500,marginBottom:6}}>Blog</h1>
      <p style={{fontSize:13,color:'#777',lineHeight:1.7,marginBottom:'1.25rem'}}>How X actually works, according to Matt Levine. New posts every three days.</p>
      <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr':'repeat(auto-fill,minmax(300px,1fr))',gap:10,marginBottom:'1.5rem'}}>
        {publishedBlogs.map(blog => {
          const t = TM[blog.theme]
          return (
            <div key={blog.slug} onClick={()=>openBlog(blog)}
              style={{background:'#fff',border:'1px solid #EAEAE4',borderRadius:12,padding:'1rem',cursor:'pointer',borderTop:`3px solid ${t?.color||'#ccc'}`,WebkitTapHighlightColor:'transparent'}}
              onMouseEnter={e=>{if(!isMobile)e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'}}
              onMouseLeave={e=>{if(!isMobile)e.currentTarget.style.boxShadow='none'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <span style={{fontSize:18}}>{t?.icon}</span>
                <ThemePill theme={blog.theme}/>
                <span style={{fontSize:10,color:'#aaa',fontFamily:"'JetBrains Mono',monospace",marginLeft:'auto'}}>{blog.publish_date}</span>
              </div>
              <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:14,fontWeight:500,lineHeight:1.4,marginBottom:6}}>{blog.title}</h3>
              <p style={{fontSize:12,color:'#777',lineHeight:1.5,marginBottom:6}}>{blog.subtitle}</p>
              <div style={{fontSize:11,color:'#aaa'}}>{blog.sections?.length} sections</div>
            </div>
          )
        })}
      </div>
      {BLOGS.filter(b=>b.publish_date>TODAY).length > 0 && (
        <>
          <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Coming soon</div>
          <div style={{display:'grid',gridTemplateColumns:isMobile?'1fr 1fr':'repeat(auto-fill,minmax(260px,1fr))',gap:6}}>
            {BLOGS.filter(b=>b.publish_date>TODAY).map(blog => {
              const t = TM[blog.theme]
              return (
                <div key={blog.slug} style={{background:'#F8F8F8',border:'1px dashed #DDD',borderRadius:10,padding:'0.875rem',opacity:0.6}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                    <span style={{fontSize:16}}>{t?.icon}</span>
                    <span style={{fontSize:10,color:'#aaa',fontFamily:"'JetBrains Mono',monospace"}}>{blog.publish_date}</span>
                  </div>
                  <div style={{fontSize:12,color:'#999',fontFamily:"'Playfair Display',serif",fontWeight:500,lineHeight:1.3}}>{blog.title.replace('Here Is How ','').replace(', According to Matt Levine','')}</div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )

  // ── Shared article drawer (full-screen on mobile) ─────────────────────────
  const MobileDrawer = ({ article, onClose }) => {
    if (!article) return null
    const t = TM[article.themes?.[0]]
    const blog = publishedBlogs.find(b => article.themes?.includes(b.theme))
    return (
      <div style={{position:'fixed',inset:0,background:'#fff',zIndex:300,overflowY:'auto',display:'flex',flexDirection:'column'}}>
        <div style={{padding:'1rem',borderBottom:'1px solid #EAEAE4',display:'flex',alignItems:'flex-start',gap:12,position:'sticky',top:0,background:'#fff',zIndex:1}}>
          <div style={{flex:1}}>
            <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'#aaa',marginBottom:3}}>{article.d} · {article.w?.toLocaleString()} words</div>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:500,lineHeight:1.4,margin:0}}>{article.t}</h2>
          </div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:24,color:'#bbb',cursor:'pointer',padding:0,lineHeight:1,flexShrink:0,marginTop:-2}}>×</button>
        </div>
        <div style={{padding:'1rem',flex:1}}>
          {article.themes?.length>0 && <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>{article.themes.map(th=><ThemePill key={th} theme={th}/>)}</div>}
          {article.lesson && (
            <div style={{background:'#FAFAF4',borderLeft:`3px solid ${t?.color||'#ccc'}`,padding:'12px 14px',borderRadius:'0 8px 8px 0',marginBottom:14}}>
              <div style={{fontSize:10,fontWeight:600,color:t?.color||'#888',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>Key passage</div>
              <div style={{fontSize:14,lineHeight:1.75,fontStyle:'italic',color:'#333'}}>"{article.lesson}"</div>
            </div>
          )}
          {article.summary && article.summary !== article.lesson && <p style={{fontSize:13,color:'#555',lineHeight:1.7,marginBottom:14}}>{article.summary}</p>}
          {blog && <div style={{background:'#F7F4FF',borderRadius:8,padding:'10px 12px',marginBottom:14}}>
            <div style={{fontSize:10,fontWeight:600,color:'#6058B0',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>Related deep-dive</div>
            <div style={{fontSize:12,color:'#333',fontWeight:500,lineHeight:1.4}}>{blog.title.replace('Here Is How ','').replace(', According to Matt Levine','')}</div>
          </div>}
          <a href={article.u} target="_blank" rel="noreferrer" style={{display:'block',textAlign:'center',fontSize:14,color:'#1455A0',textDecoration:'none',padding:'12px',border:'1px solid #1455A0',borderRadius:8,marginTop:8}}>
            Read full issue ↗
          </a>
        </div>
      </div>
    )
  }

  // Active page content
  const activePage = (() => {
    if (tab==='blog' && activeBlog) return <BlogPost blog={activeBlog} onBack={()=>{ setActiveBlog(null); window.location.hash='/blog'; }} isMobile={isMobile}/>
    if (tab==='blog') return <BlogListPage/>
    if (tab==='laws') return <LawsPage/>
    if (tab==='tickers') return <TickersPage/>
    if (tab==='articles') return <ArticlesPage/>
    return <ThemesPage/>
  })()

  // ── MOBILE LAYOUT ─────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div style={{minHeight:'100vh',background:'#FAFAF8',paddingBottom:70}}>
        {/* Full-screen article drawer on mobile */}
        {drawerArticle && <MobileDrawer article={drawerArticle} onClose={()=>setDrawerArticle(null)}/>}

        {/* Mobile header */}
        <div style={{background:'#fff',borderBottom:'1px solid #EAEAE4',padding:'12px 16px',position:'sticky',top:0,zIndex:100,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div onClick={()=>handleTabChange('themes')} style={{cursor:'pointer'}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:500,letterSpacing:'-0.01em'}}>Money Stuff Archive</div>
            <div style={{fontSize:10,color:'#bbb'}}>Matt Levine · Bloomberg · {ARTICLES.length} issues</div>
          </div>
        </div>

        {/* Content */}
        <div style={{padding:'1rem 1rem 1rem'}}>
          {activePage}
        </div>

        {/* Bottom tab bar */}
        <div style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',borderTop:'1px solid #EAEAE4',display:'flex',zIndex:100,paddingBottom:'env(safe-area-inset-bottom)'}}>
          {NAV.map(n => (
            <button key={n.id} onClick={()=>handleTabChange(n.id)}
              style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,padding:'8px 4px',border:'none',background:'transparent',color:tab===n.id?'#1a1a18':'#aaa',cursor:'pointer',position:'relative',WebkitTapHighlightColor:'transparent'}}>
              <span style={{fontSize:18,lineHeight:1}}>{n.icon}</span>
              <span style={{fontSize:9,fontWeight:tab===n.id?600:400,letterSpacing:'0.02em'}}>{n.label}</span>
              {n.badge && <span style={{position:'absolute',top:4,right:'50%',marginRight:-18,background:'#C04A1E',color:'#fff',fontSize:8,fontWeight:700,padding:'0 3px',borderRadius:6,lineHeight:'14px'}}>{n.badge}</span>}
              {tab===n.id && <div style={{position:'absolute',top:0,left:'20%',right:'20%',height:2,background:'#1a1a18',borderRadius:1}}/>}
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ── DESKTOP LAYOUT ────────────────────────────────────────────────────────
  return (
    <div style={{display:'flex',minHeight:'100vh',background:'#FAFAF8'}}>
      {drawerArticle && <div onClick={()=>setDrawerArticle(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.25)',zIndex:199}}/>}
      <ArticleDrawer article={drawerArticle} onClose={()=>setDrawerArticle(null)}/>

      {/* Sidebar */}
      <div style={{width:200,flexShrink:0,background:'#fff',borderRight:'1px solid #EAEAE4',display:'flex',flexDirection:'column',position:'sticky',top:0,height:'100vh',overflowY:'auto'}}>
        <div style={{padding:'1.5rem 1.25rem 1rem',borderBottom:'1px solid #EAEAE4'}}>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:500,lineHeight:1.3,letterSpacing:'-0.01em',cursor:'pointer'}} onClick={()=>handleTabChange('themes')}>
            Money Stuff<br/>Archive
          </div>
          <div style={{fontSize:10,color:'#bbb',marginTop:4}}>Matt Levine · Bloomberg</div>
        </div>
        <nav style={{padding:'0.75rem 0',flex:1}}>
          {NAV.map(n => (
            <button key={n.id} onClick={()=>handleTabChange(n.id)}
              style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'9px 1.25rem',border:'none',background:tab===n.id?'#F7F7F2':'transparent',color:tab===n.id?'#1a1a18':'#666',fontWeight:tab===n.id?500:400,fontSize:13,cursor:'pointer',textAlign:'left',borderLeft:tab===n.id?'3px solid #1a1a18':'3px solid transparent',position:'relative'}}>
              <span style={{fontSize:14,opacity:0.7,width:16,textAlign:'center',fontFamily:'monospace'}}>{n.icon}</span>
              {n.label}
              {n.badge && <span style={{marginLeft:'auto',background:'#C04A1E',color:'#fff',fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:8,lineHeight:1.5}}>{n.badge}</span>}
            </button>
          ))}
        </nav>
        <div style={{padding:'1rem 1.25rem',borderTop:'1px solid #EAEAE4',fontSize:10,color:'#bbb',lineHeight:1.6}}>
          {ARTICLES.length} issues archived<br/>
          <a href="http://link.mail.bloombergbusiness.com/join/4wm/moneystuff-signup" target="_blank" rel="noreferrer" style={{color:'#bbb'}}>Subscribe ↗</a>
        </div>
      </div>

      {/* Main */}
      <div style={{flex:1,minWidth:0,padding:'2rem 2.5rem 4rem',maxWidth:900}}>
        {activePage}
      </div>
    </div>
  )
}
