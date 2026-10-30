import { Icon, type IconName } from './components/ui'
import { go, useActiveWorkout, useRoute } from './hooks'
import { ExerciseScreen } from './screens/ExerciseScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { TodayScreen } from './screens/TodayScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: '', label: 'Today', icon: 'today' },
  { path: 'history', label: 'History', icon: 'history' },
  { path: 'progress', label: 'Progress', icon: 'chart' },
  { path: 'settings', label: 'Settings', icon: 'settings' },
]

export default function App() {
  const [section = '', param] = useRoute()
  const active = useActiveWorkout()

  let screen
  switch (section) {
    case 'workout':
      screen = <WorkoutScreen key={param} id={Number(param)} />
      break
    case 'exercise':
      screen = <ExerciseScreen id={param ?? ''} />
      break
    case 'history':
      screen = <HistoryScreen />
      break
    case 'progress':
      screen = <ProgressScreen />
      break
    case 'settings':
      screen = <SettingsScreen />
      break
    default:
      screen = <TodayScreen />
  }

  const inLiveWorkout = section === 'workout' && active?.id === Number(param)
  const tab = section === 'workout' || section === 'exercise' ? 'history' : section

  return (
    <div className="app">
      <main>{screen}</main>
      {!inLiveWorkout && (
        <nav className="tabbar">
          {active && section !== '' && (
            <button type="button" className="resume" onClick={() => go(`workout/${active.id}`)}>
              <span className="live-pill">Live</span> Back to your workout
            </button>
          )}
          <div className="tabs">
            {TABS.map((t) => (
              <a key={t.path} href={`#/${t.path}`} className={tab === t.path ? 'on' : ''} aria-current={tab === t.path ? 'page' : undefined}>
                <Icon name={t.icon} size={22} />
                <span>{t.label}</span>
              </a>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
