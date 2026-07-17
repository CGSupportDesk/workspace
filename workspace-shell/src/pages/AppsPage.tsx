import { ApplicationCard } from '../components/ApplicationCard'
import { workspaceApplications } from '../config/apps'

export function AppsPage() {
  return <section className="standard-page apps-page">
    <header className="page-header"><div><span className="mono-label">Application directory / 06</span><h1>All systems.</h1></div><p>Your connected tools and the next applications joining Workspace.</p></header>
    <div className="applications-grid compact-grid">{workspaceApplications.map((app, index) => <ApplicationCard key={app.id} app={app} index={index} />)}</div>
  </section>
}
