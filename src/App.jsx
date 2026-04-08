import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
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

function ThemePill({ theme, small, onClick }) {
  const t = TM[theme]; if (!t) return null
  return <span onClick={onClick} style={{display:'inline-block',fontSize:small?10:11,padding:small?'1px 6px':'2px 9px',borderRadius:20,background:t.bg,color:t.color,fontWeight:500,whiteSpace:'nowrap',cursor:onClick?'pointer':'default',lineHeight:1.6}}>{theme}</span>
}

function ReturnBadge({ pct }) {
  if (pct == null) return null
  const pos = pct >= 0
  return <span style={{fontSize:11,fontWeight:600,padding:'1px 7px',borderRadius:4,background:pos?'#EBF5DE':'#FBECEC',color:pos?'#336010':'#902828'}}>{pos?'+':''}{pct.toFixed(0)}%</span>
}

function BubbleChart({ selected, onSelect }) {
  const ref = useRef()
  const counts = useMemo(() => {
    const c = Object.fromEntries(THEMES.map(t => [t.label, 0]))
    ARTICLES.forEach(a => (a.themes||[]).forEach(th => { if(c[th]!==undefined) c[th]++ }))
    return c
  }, [])
  useEffect(() => {
    const el = ref.current; if (!el) return
    const W = el.clientWidth||700, H = 300
    d3.select(el).selectAll('*').remove()
    const data = THEMES.map(t => ({ ...t, count: counts[t.label]||0 }))
    const pack = d3.pack().size([W,H]).padding(8)
    const root = d3.hierarchy({ children: data }).sum(d => Math.max(d.count,2)+10)
    pack(root)
    const svg = d3.select(el).attr('viewBox',`0 0 ${W} ${H}`).attr('width','100%').attr('height',H)
    const node = svg.selectAll('g').data(root.leaves()).enter().append('g')
      .attr('transform',d=>`translate(${d.x},${d.y})`).style('cursor','pointer')
      .on('click',(_,d)=>onSelect(selected===d.data.label?null:d.data.label))
    node.append('circle').attr('r',d=>d.r).attr('fill',d=>d.data.bg).attr('stroke',d=>d.data.color)
      .attr('stroke-width',d=>selected===d.data.label?2.5:1)
      .attr('opacity',d=>selected&&selected!==d.data.label?0.3:1)
    node.append('text').attr('text-anchor','middle').attr('dy',d=>d.r>32?'-0.25em':'0.35em')
      .attr('font-size',d=>Math.min(d.r*0.27,12)).attr('fill',d=>d.data.color).attr('font-weight','500')
      .attr('font-family','Inter,sans-serif')
      .text(d=>{const l=d.data.label,r=d.r;if(r<20)return'';if(r<32)return l.split(' ')[0];return l.length>15?l.slice(0,14)+'…':l})
    node.filter(d=>d.r>30).append('text').attr('text-anchor','middle').attr('dy','1.1em')
      .attr('font-size',d=>Math.min(d.r*0.22,11)).attr('fill',d=>d.data.color).attr('opacity',0.7)
      .attr('font-family','Inter,sans-serif').text(d=>d.data.count)
  }, [selected])
  return <svg ref={ref} style={{width:'100%',height:300,display:'block'}} />
}

function ArticleDrawer({ article, onClose }) {
  if (!article) return null
  const t = TM[article.themes?.[0]]
  return (
    <div style={{position:'fixed',right:0,top:0,height:'100vh',width:'min(480px,100vw)',background:'#fff',borderLeft:'1px solid #EAEAE4',zIndex:200,overflowY:'auto',display:'flex',flexDirection:'column'}}>
      <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid #EAEAE4',display:'flex',alignItems:'flex-start',gap:12}}>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'#aaa',marginBottom:4}}>{article.d} · {article.w?.toLocaleString()} words</div>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:17,fontWeight:500,lineHeight:1.4,margin:0}}>{article.t}</h2>
        </div>
        <button onClick={onClose} style={{background:'none',border:'none',fontSize:18,color:'#aaa',cursor:'pointer',padding:'0 4px',flexShrink:0,lineHeight:1}}>×</button>
      </div>
      <div style={{padding:'1.25rem',flex:1}}>
        {article.themes?.length>0 && <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:16}}>{article.themes.map(th=><ThemePill key={th} theme={th}/>)}</div>}
        {article.lesson && (
          <div style={{background:'#FAFAF4',borderLeft:`3px solid ${t?.color||'#ccc'}`,padding:'12px 16px',borderRadius:'0 8px 8px 0',marginBottom:16}}>
            <div style={{fontSize:10,fontWeight:600,color:t?.color||'#888',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>Key lesson</div>
            <div style={{fontSize:13,lineHeight:1.75,fontStyle:'italic',color:'#333'}}>"{article.lesson}"</div>
          </div>
        )}
        {article.summary && article.summary !== article.lesson && (
          <p style={{fontSize:13,color:'#555',lineHeight:1.7,marginBottom:16}}>{article.summary}</p>
        )}
        {/* Related blog post */}
        {article.themes?.some(th => publishedBlogs.find(b => b.theme === th)) && (() => {
          const blog = publishedBlogs.find(b => article.themes.includes(b.theme))
          return blog ? (
            <div style={{background:'#F7F4FF',borderRadius:8,padding:'10px 14px',marginBottom:16,cursor:'pointer'}} onClick={()=>{}}>
              <div style={{fontSize:10,fontWeight:600,color:'#6058B0',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>Related deep-dive</div>
              <div style={{fontSize:12,color:'#333',fontWeight:500}}>{blog.title.replace('Here Is How ','').replace(', According to Matt Levine','')}</div>
            </div>
          ) : null
        })()}
        <a href={article.u} target="_blank" rel="noreferrer" style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,color:'#1455A0',textDecoration:'none',padding:'8px 16px',border:'1px solid #1455A0',borderRadius:6}}>
          Read full issue ↗
        </a>
      </div>
    </div>
  )
}

function ArticleRow({ a, selected, onClick }) {
  const t = TM[a.themes?.[0]]
  return (
    <div onClick={onClick} style={{padding:'10px 0',borderBottom:'1px solid #EEEEE8',cursor:'pointer',
      borderLeft:selected?`3px solid ${t?.color||'#999'}`:'3px solid transparent',
      paddingLeft:selected?10:0, background:selected?'#FAFAF4':'transparent'}}
      onMouseEnter={e=>{if(!selected)e.currentTarget.style.background='#F7F7F2'}}
      onMouseLeave={e=>{if(!selected)e.currentTarget.style.background='transparent'}}>
      <div style={{display:'flex',gap:10,alignItems:'flex-start'}}>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'#aaa',whiteSpace:'nowrap',paddingTop:2,width:72,flexShrink:0}}>{a.d}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:500,lineHeight:1.4,marginBottom:3}}>{a.t}</div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{(a.themes||[]).map(th=><ThemePill key={th} theme={th} small/>)}</div>
          {a.lesson && <div style={{fontSize:11,color:'#999',fontStyle:'italic',marginTop:3,lineHeight:1.5}}>"{a.lesson.slice(0,90)}{a.lesson.length>90?'…':''}"</div>}
        </div>
        <span style={{fontSize:10,color:'#bbb',whiteSpace:'nowrap',flexShrink:0}}>{Math.round(a.w/200)}m</span>
      </div>
    </div>
  )
}

function Flashcards({ themeFilter, onBack }) {
  const deck = useMemo(()=>ARTICLES.filter(a=>{
    if(!a.lesson||a.lesson.length<40)return false
    if(themeFilter&&!a.themes?.includes(themeFilter))return false
    return true
  }),[themeFilter])
  const [idx,setIdx]=useState(0)
  const [flipped,setFlipped]=useState(false)
  if(!deck.length)return(
    <div style={{textAlign:'center',padding:'4rem',color:'#888'}}>
      <p style={{marginBottom:16}}>No lessons for {themeFilter||'this filter'}.</p>
      <button onClick={onBack}>← Back</button>
    </div>
  )
  const cur=deck[idx%deck.length]
  const t=TM[cur.themes?.[0]]
  const next=()=>{setIdx(i=>(i+1)%deck.length);setFlipped(false)}
  const prev=()=>{setIdx(i=>(i-1+deck.length)%deck.length);setFlipped(false)}
  return(
    <div style={{maxWidth:560,margin:'0 auto',padding:'0.5rem 0 2rem'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.5rem'}}>
        <button onClick={onBack} style={{fontSize:12,color:'#666',border:'none',background:'none',padding:0}}>← Back</button>
        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'#aaa'}}>{idx%deck.length+1}/{deck.length}{themeFilter?` · ${themeFilter}`:''}</span>
        <div style={{display:'flex',gap:6}}><button onClick={prev}>←</button><button onClick={next}>→</button></div>
      </div>
      <div style={{background:'#fff',borderRadius:12,padding:'2rem',minHeight:280,display:'flex',flexDirection:'column',justifyContent:'center',border:'1px solid #EEEEE8',boxShadow:'0 2px 16px rgba(0,0,0,0.06)'}}>
        <div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'#aaa',marginBottom:12}}>{cur.d}</div>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:500,lineHeight:1.5,marginBottom:'1rem'}}>{cur.t}</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:'1.25rem'}}>{(cur.themes||[]).map(th=><ThemePill key={th} theme={th}/>)}</div>
        {!flipped
          ?<button onClick={()=>setFlipped(true)} style={{alignSelf:'flex-start',padding:'9px 18px',background:'#1a1a18',color:'#fff',border:'none',borderRadius:8,fontSize:13,cursor:'pointer'}}>Reveal lesson</button>
          :<div>
            <div style={{fontSize:10,fontWeight:600,color:t?.color||'#888',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Matt's lesson</div>
            <div style={{fontSize:14,lineHeight:1.8,fontStyle:'italic',borderLeft:`3px solid ${t?.color||'#ccc'}`,paddingLeft:14,marginBottom:12}}>"{cur.lesson}"</div>
            {cur.summary&&cur.summary!==cur.lesson&&<div style={{fontSize:12,color:'#666',lineHeight:1.6,marginBottom:12}}>{cur.summary}</div>}
            <a href={cur.u} target="_blank" rel="noreferrer" style={{fontSize:11,color:'#1455A0',textDecoration:'none'}}>Read full ↗</a>
          </div>}
      </div>
      <div style={{display:'flex',justifyContent:'center',gap:3,marginTop:14,flexWrap:'wrap'}}>
        {[...Array(Math.min(deck.length,30))].map((_,i)=>(
          <div key={i} onClick={()=>{setIdx(i);setFlipped(false)}} style={{width:6,height:6,borderRadius:3,background:i===(idx%deck.length)?'#1a1a18':'#ddd',cursor:'pointer'}}/>
        ))}
        {deck.length>30&&<span style={{fontSize:10,color:'#aaa',marginLeft:4}}>+{deck.length-30}</span>}
      </div>
    </div>
  )
}

function BlogPost({ blog, onBack }) {
  const t = TM[blog.theme]
  return(
    <div style={{maxWidth:700,margin:'0 auto',padding:'0 0 4rem'}}>
      <button onClick={onBack} style={{fontSize:12,color:'#666',border:'none',background:'none',padding:0,marginBottom:'1.5rem',cursor:'pointer'}}>← Blog</button>
      <div style={{marginBottom:'2rem'}}>
        <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:12}}>
          <ThemePill theme={blog.theme}/>
          <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,color:'#aaa'}}>{blog.publish_date} · {blog.article_count} source articles</span>
        </div>
        <h1 style={{fontFamily:"'Playfair Display',serif",fontSize:28,fontWeight:600,lineHeight:1.3,marginBottom:10,letterSpacing:'-0.01em'}}>{blog.title}</h1>
        <p style={{fontSize:16,color:'#666',fontStyle:'italic',marginBottom:0}}>{blog.subtitle}</p>
      </div>
      <div style={{borderTop:'2px solid #1a1a18',paddingTop:'1.5rem',marginBottom:'2rem'}}>
        {blog.intro.split('\n\n').map((p,i)=><p key={i} style={{fontSize:15,lineHeight:1.8,color:'#333',marginBottom:'1rem'}}>{p}</p>)}
      </div>
      {blog.sections?.map((s,i)=>(
        <div key={i} style={{marginBottom:'2.5rem'}}>
          <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:500,lineHeight:1.4,marginBottom:'1rem',borderLeft:`3px solid ${t?.color||'#ccc'}`,paddingLeft:14}}>{s.heading}</h2>
          <blockquote style={{margin:'0 0 1.25rem',padding:'1.25rem 1.5rem',background:t?.bg||'#f8f8f4',borderLeft:`4px solid ${t?.color||'#ccc'}`,borderRadius:'0 10px 10px 0',fontFamily:"'Playfair Display',serif",fontSize:15,lineHeight:1.85,fontStyle:'italic',color:'#333'}}>
            <p style={{margin:'0 0 10px'}}>"{s.quote}"</p>
            <footer style={{fontFamily:"Inter,sans-serif",fontSize:11,fontStyle:'normal',color:'#888'}}>
              — <a href={s.quote_url} target="_blank" rel="noreferrer" style={{color:t?.color||'#666',textDecoration:'none',fontWeight:500}}>{s.quote_title}</a>
              {s.quote_date && ` · ${s.quote_date}`}
            </footer>
          </blockquote>
          {s.commentary.split('\n\n').map((p,j)=><p key={j} style={{fontSize:14,lineHeight:1.8,color:'#444',marginBottom:'0.875rem'}}>{p}</p>)}
        </div>
      ))}
      <div style={{borderTop:'2px solid #1a1a18',paddingTop:'1.5rem',marginBottom:'1.5rem'}}>
        {blog.conclusion?.split('\n\n').map((p,i)=><p key={i} style={{fontSize:15,lineHeight:1.8,color:'#333',marginBottom:'1rem'}}>{p}</p>)}
      </div>
      {blog.key_insight && (
        <div style={{background:'#1a1a18',color:'#fff',borderRadius:10,padding:'1.25rem 1.5rem',fontSize:15,fontStyle:'italic',lineHeight:1.7}}>
          "{blog.key_insight}"
        </div>
      )}
    </div>
  )
}

function Timeline() {
  const svgRef = useRef()
  const data = useMemo(()=>{
    const counts={}
    ARTICLES.forEach(a=>{
      const ym=a.d?.slice(0,7)
      if(ym) counts[ym]=(counts[ym]||0)+1
    })
    return Object.entries(counts).sort((a,b)=>a[0]<b[0]?-1:1).map(([ym,n])=>({ym,n,year:ym.slice(0,4)}))
  },[])

  useEffect(()=>{
    const el=svgRef.current; if(!el) return
    const W=el.clientWidth||800, H=160, margin={top:10,right:10,bottom:30,left:30}
    const iW=W-margin.left-margin.right, iH=H-margin.top-margin.bottom
    d3.select(el).selectAll('*').remove()
    const svg=d3.select(el).attr('viewBox',`0 0 ${W} ${H}`).attr('width','100%').attr('height',H)
    const g=svg.append('g').attr('transform',`translate(${margin.left},${margin.top})`)
    const x=d3.scaleBand().domain(data.map(d=>d.ym)).range([0,iW]).padding(0.15)
    const y=d3.scaleLinear().domain([0,d3.max(data,d=>d.n)]).range([iH,0])
    // Year gridlines
    const years=[...new Set(data.map(d=>d.year))]
    years.forEach(yr=>{
      const firstOfYear=data.find(d=>d.year===yr)
      if(!firstOfYear)return
      const xPos=x(firstOfYear.ym)
      g.append('line').attr('x1',xPos).attr('x2',xPos).attr('y1',0).attr('y2',iH).attr('stroke','#EAEAE4').attr('stroke-width',1)
      g.append('text').attr('x',xPos+3).attr('y',iH+18).attr('font-size',10).attr('fill','#aaa').attr('font-family','JetBrains Mono,monospace').text(yr)
    })
    g.selectAll('rect').data(data).enter().append('rect')
      .attr('x',d=>x(d.ym)).attr('y',d=>y(d.n))
      .attr('width',x.bandwidth()).attr('height',d=>iH-y(d.n))
      .attr('fill','#1a1a18').attr('opacity',0.75).attr('rx',1)
      .on('mouseover',function(e,d){d3.select(this).attr('opacity',1);tooltip.style('opacity',1).html(`${d.ym}<br>${d.n} articles`).style('left',(e.offsetX+10)+'px').style('top',(e.offsetY-30)+'px')})
      .on('mouseout',function(){d3.select(this).attr('opacity',0.75);tooltip.style('opacity',0)})
    const tooltip=d3.select(el.parentNode).append('div').style('position','absolute').style('background','#1a1a18').style('color','#fff').style('font-size','11px').style('padding','4px 8px').style('border-radius','4px').style('pointer-events','none').style('opacity',0).style('font-family','JetBrains Mono,monospace')
  },[data])

  return <div style={{position:'relative'}}><svg ref={svgRef} style={{width:'100%',height:160,display:'block'}}/></div>
}

export default function App() {
  const [tab,setTab]=useState('themes')
  const [selectedTheme,setSelectedTheme]=useState(null)
  const [drawerArticle,setDrawerArticle]=useState(null)
  const [search,setSearch]=useState('')
  const [year,setYear]=useState('all')
  const [flashTheme,setFlashTheme]=useState(null)
  const [activeBlog,setActiveBlog]=useState(null)
  const [expandedTicker,setExpandedTicker]=useState(null)

  const years=useMemo(()=>['all',...[...new Set(ARTICLES.map(a=>a.d?.slice(0,4)).filter(Boolean))].sort().reverse()],[])

  const filtered=useMemo(()=>ARTICLES.filter(a=>{
    if(year!=='all'&&!a.d?.startsWith(year))return false
    if(search){
      const q=search.toLowerCase()
      if(!a.t.toLowerCase().includes(q)&&!a.lesson?.toLowerCase().includes(q)&&!a.summary?.toLowerCase().includes(q))return false
    }
    if(selectedTheme&&!a.themes?.includes(selectedTheme))return false
    return true
  }).slice(0,400),[year,search,selectedTheme])

  const themeCounts=useMemo(()=>{
    const c=Object.fromEntries(THEMES.map(t=>[t.label,0]))
    ARTICLES.forEach(a=>(a.themes||[]).forEach(th=>{if(c[th]!==undefined)c[th]++}))
    return c
  },[])

  useEffect(()=>{
    document.body.style.overflow=drawerArticle?'hidden':'auto'
    return()=>{document.body.style.overflow='auto'}
  },[drawerArticle])

  if(tab==='flashcard')return(
    <div style={{maxWidth:800,margin:'0 auto',padding:'1.5rem 1rem'}}>
      <Flashcards themeFilter={flashTheme} onBack={()=>setTab('themes')}/>
    </div>
  )

  if(tab==='blog'&&activeBlog)return(
    <div style={{maxWidth:1000,margin:'0 auto',padding:'1.5rem 1rem'}}>
      <BlogPost blog={activeBlog} onBack={()=>setActiveBlog(null)}/>
    </div>
  )

  const navBtn=(v,label,badge)=>(
    <button key={v} onClick={()=>setTab(v)} style={{fontSize:13,padding:'7px 16px',fontWeight:tab===v?500:400,background:tab===v?'#1a1a18':'transparent',color:tab===v?'#fff':'#555',border:tab===v?'1px solid #1a1a18':'1px solid #ddd',borderRadius:6,position:'relative'}}>
      {label}
      {badge&&<span style={{position:'absolute',top:-6,right:-6,background:'#C04A1E',color:'#fff',fontSize:9,fontWeight:700,padding:'1px 4px',borderRadius:8,lineHeight:1.5}}>{badge}</span>}
    </button>
  )

  return(
    <div style={{minHeight:'100vh',background:'#FAFAF8'}}>
      {drawerArticle&&<div onClick={()=>setDrawerArticle(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.3)',zIndex:199}}/>}
      <ArticleDrawer article={drawerArticle} onClose={()=>setDrawerArticle(null)}/>

      <div style={{borderBottom:'1px solid #EAEAE4',background:'#fff',position:'sticky',top:0,zIndex:100}}>
        <div style={{maxWidth:1000,margin:'0 auto',padding:'0 1rem',display:'flex',alignItems:'center',justifyContent:'space-between',height:56,gap:12,flexWrap:'wrap'}}>
          <div>
            <span style={{fontFamily:"'Playfair Display',serif",fontSize:18,fontWeight:500,letterSpacing:'-0.01em',cursor:'pointer'}} onClick={()=>{setTab('themes');setActiveBlog(null)}}>Money Stuff Archive</span>
            <span style={{fontSize:11,color:'#aaa',marginLeft:10}}>Matt Levine · Bloomberg · 2012–2026</span>
          </div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            {navBtn('themes','Themes')}
            {navBtn('articles',`Articles (${ARTICLES.length})`)}
            {navBtn('blog','Blog',publishedBlogs.length)}
            {navBtn('tickers','Tickers')}
            {navBtn('laws','Laws')}
          </div>
        </div>
      </div>

      <div style={{maxWidth:1000,margin:'0 auto',padding:'1.5rem 1rem 4rem'}}>

        {/* ── THEMES ── */}
        {tab==='themes'&&(
          <div>
            <p style={{fontSize:14,color:'#555',lineHeight:1.7,marginBottom:'1.5rem',maxWidth:680}}>
              {ARTICLES.length} issues of Matt Levine's Money Stuff classified across {THEMES.length} themes.
              Click a bubble or theme card to filter articles. Double-click a card to open flashcards.
            </p>
            <div style={{background:'#fff',border:'1px solid #EAEAE4',borderRadius:12,padding:'1rem',marginBottom:'1.5rem'}}>
              <div style={{fontSize:11,color:'#aaa',marginBottom:8}}>
                Bubble size = article count. Click to filter.
                {selectedTheme&&<span style={{marginLeft:8,color:TM[selectedTheme]?.color,fontWeight:500}}>· {selectedTheme} · <span style={{cursor:'pointer',textDecoration:'underline'}} onClick={()=>setSelectedTheme(null)}>clear</span></span>}
              </div>
              <BubbleChart selected={selectedTheme} onSelect={setSelectedTheme}/>
            </div>

            <div style={{marginBottom:'1.5rem'}}>
              <div style={{fontSize:11,color:'#aaa',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.05em',fontWeight:600}}>Articles per month</div>
              <Timeline/>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(290px,1fr))',gap:10}}>
              {THEMES.map(th=>{
                const count=themeCounts[th.label]||0
                const blog=publishedBlogs.find(b=>b.theme===th.label)
                const topLesson=ARTICLES.find(a=>a.themes?.includes(th.label)&&a.lesson?.length>50)
                return(
                  <div key={th.label}
                    style={{background:'#fff',border:'1px solid #EAEAE4',borderRadius:10,padding:'1rem',cursor:'pointer',borderTop:`3px solid ${th.color}`,opacity:selectedTheme&&selectedTheme!==th.label?0.5:1,transition:'opacity 0.2s,box-shadow 0.15s',userSelect:'none'}}
                    onClick={()=>setSelectedTheme(selectedTheme===th.label?null:th.label)}
                    onDoubleClick={()=>{setFlashTheme(th.label);setTab('flashcard')}}
                    onMouseEnter={e=>e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,0.08)'}
                    onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
                    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontSize:18}}>{th.icon}</span>
                        <span style={{fontSize:13,fontWeight:500}}>{th.label}</span>
                      </div>
                      <div style={{display:'flex',gap:6,alignItems:'center'}}>
                        <span style={{fontSize:11,color:'#aaa'}}>{count}</span>
                        {blog&&<span onClick={e=>{e.stopPropagation();setActiveBlog(blog);setTab('blog')}} style={{fontSize:10,padding:'1px 7px',borderRadius:10,background:th.bg,color:th.color,fontWeight:500,cursor:'pointer'}}>Blog ↗</span>}
                      </div>
                    </div>
                    {topLesson&&(
                      <div style={{borderTop:'1px solid #EEEEE8',paddingTop:8,marginTop:4}}>
                        <div style={{fontSize:10,color:'#bbb',marginBottom:3}}>Sample lesson</div>
                        <div style={{fontSize:11,fontStyle:'italic',color:'#666',lineHeight:1.6}}>"{topLesson.lesson.slice(0,100)}{topLesson.lesson.length>100?'…':''}"</div>
                      </div>
                    )}
                    <div style={{marginTop:8,fontSize:10,color:'#ccc'}}>Double-click for flashcards</div>
                  </div>
                )
              })}
            </div>

            {selectedTheme&&(
              <div style={{marginTop:'2rem'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:20,fontWeight:500,margin:0}}>{selectedTheme}</h2>
                  <div style={{display:'flex',gap:8}}>
                    <button onClick={()=>{setFlashTheme(selectedTheme);setTab('flashcard')}} style={{fontSize:12,color:TM[selectedTheme]?.color,borderColor:TM[selectedTheme]?.color}}>Flashcards →</button>
                    <button onClick={()=>setTab('articles')} style={{fontSize:12}}>All articles →</button>
                  </div>
                </div>
                {ARTICLES.filter(a=>a.themes?.includes(selectedTheme)).slice(0,8).map(a=>(
                  <ArticleRow key={a.id} a={a} selected={drawerArticle?.id===a.id} onClick={()=>setDrawerArticle(d=>d?.id===a.id?null:a)}/>
                ))}
                {ARTICLES.filter(a=>a.themes?.includes(selectedTheme)).length>8&&(
                  <div style={{textAlign:'center',padding:'0.75rem',fontSize:12,color:'#888'}}>
                    +{ARTICLES.filter(a=>a.themes?.includes(selectedTheme)).length-8} more ·{' '}
                    <span style={{color:'#1455A0',cursor:'pointer'}} onClick={()=>setTab('articles')}>view all</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ARTICLES ── */}
        {tab==='articles'&&(
          <div style={{display:'flex',gap:'1.5rem'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{display:'flex',gap:8,marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search titles, lessons, summaries…" style={{flex:'1 1 220px',maxWidth:320}}/>
                <select value={year} onChange={e=>setYear(e.target.value)}>
                  {years.map(y=><option key={y} value={y}>{y==='all'?'All years':y}</option>)}
                </select>
                <select value={selectedTheme||''} onChange={e=>setSelectedTheme(e.target.value||null)}>
                  <option value=''>All themes</option>
                  {THEMES.map(t=><option key={t.label} value={t.label}>{t.label}</option>)}
                </select>
                {(selectedTheme||search||year!=='all')&&<button onClick={()=>{setSelectedTheme(null);setSearch('');setYear('all')}} style={{fontSize:11,color:'#888'}}>Clear</button>}
              </div>
              <div style={{fontSize:11,color:'#aaa',marginBottom:8}}>{filtered.length}{filtered.length===400?' (max 400)':''} articles{selectedTheme&&` · ${selectedTheme}`}{search&&` · "${search}"`}</div>
              {filtered.map(a=><ArticleRow key={a.id} a={a} selected={drawerArticle?.id===a.id} onClick={()=>setDrawerArticle(d=>d?.id===a.id?null:a)}/>)}
              {!filtered.length&&<div style={{textAlign:'center',padding:'3rem',color:'#aaa'}}>No results.</div>}
            </div>
          </div>
        )}

        {/* ── BLOG ── */}
        {tab==='blog'&&(
          <div>
            <p style={{fontSize:14,color:'#555',lineHeight:1.7,marginBottom:'1.5rem',maxWidth:620}}>
              Deep-dives into Matt's recurring themes. "Here is how X actually works, according to Matt Levine." New posts every three days.
            </p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12}}>
              {publishedBlogs.map(blog=>{
                const t=TM[blog.theme]
                return(
                  <div key={blog.slug} onClick={()=>{setActiveBlog(blog)}} style={{background:'#fff',border:'1px solid #EAEAE4',borderRadius:12,padding:'1.25rem',cursor:'pointer',borderTop:`3px solid ${t?.color||'#ccc'}`,transition:'box-shadow 0.15s'}}
                    onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'}
                    onMouseLeave={e=>e.currentTarget.style.boxShadow='none'}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                      <span style={{fontSize:20}}>{t?.icon}</span>
                      <ThemePill theme={blog.theme}/>
                      <span style={{fontSize:10,color:'#aaa',fontFamily:"'JetBrains Mono',monospace",marginLeft:'auto'}}>{blog.publish_date}</span>
                    </div>
                    <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:16,fontWeight:500,lineHeight:1.4,marginBottom:8}}>{blog.title}</h3>
                    <p style={{fontSize:12,color:'#777',lineHeight:1.6,marginBottom:10}}>{blog.subtitle}</p>
                    <div style={{fontSize:11,color:'#aaa'}}>{blog.sections?.length} sections · {blog.article_count} source articles</div>
                  </div>
                )
              })}
              {BLOGS.filter(b=>b.publish_date>TODAY).map(blog=>{
                const t=TM[blog.theme]
                return(
                  <div key={blog.slug} style={{background:'#F8F8F8',border:'1px dashed #DDD',borderRadius:12,padding:'1.25rem',opacity:0.6}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                      <span style={{fontSize:20}}>{t?.icon}</span>
                      <span style={{fontSize:11,color:'#999',fontFamily:"'JetBrains Mono',monospace"}}>Publishes {blog.publish_date}</span>
                    </div>
                    <h3 style={{fontFamily:"'Playfair Display',serif",fontSize:15,fontWeight:500,color:'#999',lineHeight:1.4}}>{blog.title}</h3>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── TICKERS ── */}
        {tab==='tickers'&&(
          <div>
            <p style={{fontSize:14,color:'#555',lineHeight:1.7,marginBottom:'1.5rem',maxWidth:680}}>
              Stocks mentioned in the archive, with return since Matt first wrote about them (Yahoo Finance). Plus companies that went bankrupt since he covered them.
            </p>
            <div style={{marginBottom:'2rem'}}>
              <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Active companies — return since first mention</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(400px,1fr))',gap:8}}>
                {[...TICKERS].sort((a,b)=>b.return_pct-a.return_pct).map(t=>(
                  <div key={t.ticker} style={{background:'#fff',border:'1px solid #EAEAE4',borderRadius:10,padding:'12px 16px',cursor:'pointer'}} onClick={()=>setExpandedTicker(expandedTicker===t.ticker?null:t.ticker)}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{width:44,height:44,borderRadius:8,background:t.return_pct>=0?'#EBF5DE':'#FBECEC',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,fontSize:11,color:t.return_pct>=0?'#336010':'#902828'}}>{t.ticker}</span>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12,color:'#666'}}>First mentioned <strong style={{color:'#333'}}>{t.first_date}</strong> · {t.mention_count}×</div>
                        <div style={{fontSize:11,color:'#aaa',marginTop:1}}>{t.mentions?.[0]?.t?.slice(0,50)}…</div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontSize:11,color:'#888',marginBottom:2}}>${t.price_then} → <strong>${t.price_now}</strong></div>
                        <ReturnBadge pct={t.return_pct}/>
                      </div>
                    </div>
                    {expandedTicker===t.ticker&&(
                      <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #EEEEE8'}}>
                        <div style={{fontSize:11,color:'#888',marginBottom:4}}>Most recent mentions:</div>
                        {t.mentions?.slice(0,5).map((m,i)=><div key={i} style={{fontSize:11,padding:'2px 0',color:'#555'}}><span style={{fontFamily:"'JetBrains Mono',monospace",color:'#aaa',marginRight:8}}>{m.d}</span>{m.t}</div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:'#aaa',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Companies that went bankrupt</div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(400px,1fr))',gap:8}}>
                {BANKRUPT.map(b=>(
                  <div key={b.ticker} style={{background:'#fff',border:'1px solid #F2E8E8',borderRadius:10,padding:'12px 16px',borderLeft:'3px solid #902828',cursor:'pointer'}} onClick={()=>setExpandedTicker(expandedTicker===b.ticker?null:b.ticker)}>
                    <div style={{display:'flex',alignItems:'center',gap:12}}>
                      <div style={{width:44,height:44,borderRadius:8,background:'#FBECEC',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,fontSize:10,color:'#902828'}}>{b.ticker}</span>
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                          <strong style={{fontSize:13}}>{b.name}</strong>
                          <span style={{fontSize:10,padding:'1px 6px',borderRadius:4,background:'#902828',color:'#fff',fontWeight:600}}>BANKRUPT</span>
                        </div>
                        <div style={{fontSize:11,color:'#aaa'}}>{b.bankruptcy_date} · mentioned {b.mention_count}× in archive</div>
                      </div>
                    </div>
                    {expandedTicker===b.ticker&&(
                      <div style={{marginTop:10,paddingTop:10,borderTop:'1px solid #F2E8E8'}}>
                        <p style={{fontSize:12,color:'#666',lineHeight:1.6,marginBottom:8}}>{b.note}</p>
                        {b.mentions?.slice(0,4).map((m,i)=><div key={i} style={{fontSize:11,padding:'2px 0',color:'#555'}}><span style={{fontFamily:"'JetBrains Mono',monospace",color:'#aaa',marginRight:8}}>{m.d}</span>{m.t}</div>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p style={{fontSize:11,color:'#bbb',marginTop:'1rem'}}>Prices via Yahoo Finance (pre-loaded daily). Not financial advice.</p>
            </div>
          </div>
        )}

        {/* ── LAWS ── */}
        {tab==='laws'&&(
          <div style={{maxWidth:760}}>
            <h2 style={{fontFamily:"'Playfair Display',serif",fontSize:24,fontWeight:500,marginBottom:8}}>The Laws of Insider Trading</h2>
            <p style={{fontSize:14,color:'#555',lineHeight:1.7,marginBottom:'2rem'}}>
              Matt Levine has been adding to this list since 2016. None of it is legal advice. The First Law says it all.
            </p>
            {LAWS.map(l=>(
              <div key={l.number} style={{display:'flex',gap:20,marginBottom:'1.5rem',paddingBottom:'1.5rem',borderBottom:'1px solid #EEEEE8'}}>
                <div style={{fontFamily:"'Playfair Display',serif",fontSize:36,fontWeight:600,color:'#EAEAE4',flexShrink:0,width:48,textAlign:'center',lineHeight:1}}>{l.number}</div>
                <div>
                  <p style={{fontSize:15,lineHeight:1.7,color:'#1a1a18',marginBottom:6,fontStyle:l.number===1?'italic':'normal',fontWeight:l.number===1?500:400}}>{l.description}</p>
                  <a href={l.article_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:'#aaa',textDecoration:'none'}}>
                    — {l.article_title} · {l.article_date}
                  </a>
                </div>
              </div>
            ))}
            <p style={{fontSize:12,color:'#bbb',marginTop:'1rem',fontStyle:'italic'}}>None of this is legal advice. Probably put that at the top of your spreadsheet.</p>
          </div>
        )}

      </div>

      <div style={{borderTop:'1px solid #EAEAE4',padding:'1.5rem 1rem',textAlign:'center',fontSize:11,color:'#bbb',background:'#fff'}}>
        Money Stuff Archive · Unofficial fan archive · Matt Levine writes for{' '}
        <a href="https://www.bloomberg.com/opinion/authors/ARbTQlRLRjE/matthew-s-levine" target="_blank" rel="noreferrer" style={{color:'#aaa'}}>Bloomberg Opinion</a>
        {' '}· Subscribe at{' '}
        <a href="http://link.mail.bloombergbusiness.com/join/4wm/moneystuff-signup" target="_blank" rel="noreferrer" style={{color:'#aaa'}}>bloomberg.com</a>
      </div>
    </div>
  )
}
