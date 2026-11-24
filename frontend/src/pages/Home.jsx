import { Link } from 'react-router-dom'

const features = [
  {
    icon: '01',
    title: 'Learn from your material',
    description: 'Ask questions about class PDFs and get grounded answers with page references.',
  },
  {
    icon: '02',
    title: 'Make your resume sharper',
    description: 'Compare your experience with a role and get clear, practical improvement ideas.',
  },
  {
    icon: '03',
    title: 'Practice with purpose',
    description: 'Work through role-specific interview questions and build confidence one answer at a time.',
  },
]

const skills = ['Python', 'React', 'SQL', 'Data Structures', 'Flask', 'Problem Solving', 'Git', 'Communication']
const careerSteps = [
  { number: '01', title: 'Build technical skills', text: 'Strengthen the fundamentals employers ask about.' },
  { number: '02', title: 'Prepare your story', text: 'Connect your projects and experience to the role.' },
  { number: '03', title: 'Practice interviews', text: 'Get comfortable explaining how you think.' },
  { number: '04', title: 'Explore placements', text: 'Show up ready when the right opportunity comes.' },
]

function PreviewWindow() {
  return (
    <div className="product-preview" aria-hidden="true">
      <div className="preview-window">
        <div className="preview-topbar">
          <div className="preview-dots" aria-hidden="true"><i /><i /><i /></div>
          <span className="preview-top-label">Your learning workspace</span>
          <span className="brand-mark" style={{ width: '1.7rem', height: '1.7rem', borderRadius: '.6rem', fontSize: '.65rem' }}>CP</span>
        </div>
        <div className="preview-body" aria-hidden="true">
          <div className="preview-sidebar">
            <span className="preview-side-item active" />
            <span className="preview-side-item" />
            <span className="preview-side-item" />
            <span className="preview-side-item" />
          </div>
          <div className="preview-content">
            <div className="preview-greeting" />
            <div className="preview-caption" />
            <div className="preview-cards">
              <div className="preview-card"><b>PDF</b><span /></div>
              <div className="preview-card"><b>AI</b><span /></div>
              <div className="preview-card"><b>CV</b><span /></div>
            </div>
            <div className="preview-chat">
              <div className="preview-message user">
                <div className="preview-line mid" />
              </div>
              <div className="preview-message">
                <div className="preview-line" />
                <div className="preview-line mid" />
                <div className="preview-line short" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="preview-float">
        <span className="preview-score">AI</span>
        <span><b>Role feedback</b><small>Get practical next steps.</small></span>
      </div>
    </div>
  )
}

function Home() {
  return (
    <div className="home-shell min-h-screen text-white">
      <nav className="home-nav">
        <Link to="/" className="flex items-center gap-3" aria-label="CampusPilot AI home">
          <span className="brand-mark">CP</span>
          <span className="brand-wordmark">CampusPilot <span className="text-blue-400">AI</span></span>
        </Link>
        <div className="home-nav-links">
          <Link to="/login" className="nav-link">Log in</Link>
          <Link to="/register" className="primary-link">Create account <span aria-hidden="true">↗</span></Link>
        </div>
      </nav>

      <main>
        <section className="home-hero">
          <div className="hero-copy">
            <span className="hero-pill"><i className="hero-pill-dot" /> Your next step, made clearer</span>
            <h1 className="hero-title">Make your next move <span>your best one.</span></h1>
            <p className="hero-description">
              One thoughtful workspace for studying, polishing your resume, and
              getting ready for the opportunities ahead.
            </p>
            <div className="hero-actions">
              <Link to="/register" className="primary-link">Get started free <span aria-hidden="true">→</span></Link>
              <Link to="/login" className="secondary-link">I already have an account</Link>
            </div>
            <p className="hero-note">Built for students figuring out what comes next.</p>
          </div>
          <PreviewWindow />
        </section>

        <section className="feature-section" aria-labelledby="features-heading">
          <p className="eyebrow">One workspace, three ways forward</p>
          <h2 id="features-heading" className="feature-heading">Tools for the work ahead.</h2>
          <div className="feature-grid">
            {features.map((feature) => (
              <article className="feature-card" key={feature.title}>
                <span className="feature-icon" aria-hidden="true">{feature.icon}</span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="career-section" aria-labelledby="career-heading">
          <div className="career-copy">
            <p className="eyebrow">From skills to opportunities</p>
            <h2 id="career-heading">Build your path to placement, one step at a time.</h2>
            <p>Keep the technical practice, resume work, and interview preparation connected to the role you want.</p>
            <Link to="/register" className="primary-link">Plan your next step <span aria-hidden="true">→</span></Link>
          </div>

          <div className="career-visual">
            <div className="skills-panel">
              <div className="skills-panel-heading">
                <span className="skills-panel-icon" aria-hidden="true">⌘</span>
                <span><b>Skills in motion</b><small>Keep learning, keep building</small></span>
                <span className="skills-live"><i /> LIVE</span>
              </div>
              <div className="skills-marquee" role="region" aria-label="Technical and career skills">
                <span className="sr-only">Skills shown: {skills.join(', ')}.</span>
                <div className="skills-track" aria-hidden="true">
                  {[...skills, ...skills].map((skill, index) => (
                    <span className="skill-chip" key={`${skill}-${index}`}>{skill}</span>
                  ))}
                </div>
              </div>
              <div className="skills-bottom-row">
                <span className="skill-mini-bar"><i /></span>
                <span>Learn a skill. Apply it to a project.</span>
              </div>
            </div>

            <div className="placement-panel">
              <div className="placement-panel-heading">
                <span className="eyebrow">Your placement journey</span>
                <span className="placement-route-label">A path, not a race</span>
              </div>
              <div className="placement-steps">
                <span className="placement-route-line" aria-hidden="true"><i /></span>
                {careerSteps.map((step) => (
                  <article className="placement-step" key={step.number}>
                    <span className="placement-step-number">{step.number}</span>
                    <span><b>{step.title}</b><small>{step.text}</small></span>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <span className="flex items-center gap-2"><span className="brand-mark" style={{ width: '1.5rem', height: '1.5rem', borderRadius: '.5rem', fontSize: '.58rem' }}>CP</span> CampusPilot AI</span>
        <span>Learn with focus. Move forward with confidence.</span>
      </footer>
    </div>
  )
}

export default Home
