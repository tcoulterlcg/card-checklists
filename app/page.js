// Server entry for every URL. The app itself is the client component in
// app/home.js (it reads ?set=, ?player=, ?view= … in the browser); this wrapper
// adds each page's own title, description and link preview on the server so
// shared links and Google show "2023 Topps Chrome Checklist", not the home page.
// New kinds of page: add their metadata in lib/meta.js.
import Home from './home'
import { pageMeta } from '../lib/meta'

export async function generateMetadata({ searchParams }) {
  return pageMeta(await searchParams)
}

export default function Page() {
  return <Home />
}
