import { ReminderSync } from './components/Notifications'
import { Icon, type IconName } from './components/ui'
import { go, useActiveWorkout, useRoute } from './hooks'
import { useIntervalRun } from './lib/intervals'
import { ExerciseScreen } from './screens/ExerciseScreen'
import { ProgressScreen } from './screens/ProgressScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { TimerScreen } from './screens/TimerScreen'
import { TodayScreen } from './screens/TodayScreen'
import { WorkoutScreen } from './screens/WorkoutScreen'

const TABS: { path: string; label: string; icon: IconName }[] = [
  { path: '', label: 'Today', icon: 'today' },
  { path: 'timer', label: 'Timer', icon: 'timer' },
  { path: 'progress', label: 'Progress', icon: 'chart' },
]

export default function App() {
  const [section = '', param, sub] = useRoute()
  const active = useActiveWorkout()
  const intervals = useIntervalRun()

  let screen
  switch (section) {
    case 'workout':
      screen = <WorkoutScreen key={param} id={Number(param)} edit={sub === 'edit'} />
      break
    case 'exercise':
      screen = <ExerciseScreen id={param ?? ''} />
      break
    case 'progress':
    case 'history':
      screen = <ProgressScreen />
      break
    case 'settings':
      screen = <SettingsScreen />
      break
    case 'timer':
      screen = <TimerScreen />
      break
    default:
      screen = <TodayScreen />
  }

  const inLiveWorkout = section === 'workout' && active?.id === Number(param)
  const tab = section === '' || section === 'timer' ? section : 'progress'

  return (
    <div className="app">
      <main>{screen}</main>
      <ReminderSync />
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
                {t.path === 'timer' && intervals && tab !== 'timer' && <i className="tab-dot" aria-label="running" />}
              </a>
            ))}
          </div>
        </nav>
      )}
    </div>
  )
}
