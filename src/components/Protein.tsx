import { useEffect, useState } from 'react'
import { saveSettings, type Settings } from '../db'
import { useBodyweights, useNow, useProtein } from '../hooks'
import { dateKey, fmtTime } from '../lib/format'
import { addProtein, FOODS, PROTEIN_PER_KG, proteinGoal, removeProtein } from '../lib/protein'
import { ConfirmButton, Icon, NumInput, Ring, Sheet, Stepper } from './ui'

/** Today's protein against the target. Tap to log a meal. */
export function ProteinTile({ settings }: { settings: Settings }) {
  const entries = useProtein()
  const bodyweights = useBodyweights()
  const [open, setOpen] = useState(false)
  const now = useNow(30_000)
  if (!entries || !bodyweights) return <div className="tile protein-tile" />
  const today = dateKey(new Date(now))
  const got = entries.filter((e) => e.date === today).reduce((s, e) => s + e.grams, 0)
  const goal = proteinGoal(settings, bodyweights).grams
  const left = goal - got

  return (
    <>
      <button type="button" className="tile protein-tile" onClick={() => setOpen(true)}>
        <Ring value={got / goal} size={50} stroke={5}>
          <Icon name={left <= 0 ? 'check' : 'egg'} size={20} />
        </Ring>
        <span className="tile-body">
          <span className="eyebrow">Protein</span>
          <b className="tile-num">
            {got}
            <small> / {goal} g</small>
          </b>
          <small className={left <= 0 ? 'ok' : ''}>{left <= 0 ? 'Target hit today' : got ? `${left} g to go` : 'Tap after a meal to add'}</small>
        </span>
        <span className="tile-add" aria-hidden="true">
          <Icon name="plus" size={20} />
        </span>
      </button>
      {open && <ProteinSheet settings={settings} onClose={() => setOpen(false)} />}
    </>
  )
}

function ProteinSheet({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const entries = useProtein() ?? []
  const bodyweights = useBodyweights() ?? []
  const now = useNow(30_000)
  const [custom, setCustom] = useState<number | null>(null)
  const [last, setLast] = useState<{ id: number; grams: number } | null>(null)
  const today = dateKey(new Date(now))
  const todays = entries.filter((e) => e.date === today)
  const got = todays.reduce((s, e) => s + e.grams, 0)
  const goal = proteinGoal(settings, bodyweights)
  const left = goal.grams - got

  useEffect(() => {
    if (!last) return
    const t = setTimeout(() => setLast(null), 6000)
    return () => clearTimeout(t)
  }, [last])

  const add = async (grams: number) => {
    if (!grams || grams <= 0) return
    const id = await addProtein(grams)
    setLast({ id, grams: Math.round(grams) })
  }

  return (
    <Sheet title="Protein today" onClose={onClose} fit>
      <div className="protein-head">
        <b className="display">{got}</b>
        <span>
          of {goal.grams} g
          <small className={left <= 0 ? 'ok' : 'muted'}>{left <= 0 ? 'Target hit. Nice.' : `${left} g to go`}</small>
        </span>
      </div>

      <div className="quick-add">
        {[10, 20, 30].map((g) => (
          <button type="button" key={g} className="btn" onClick={() => add(g)}>
            +{g} g
          </button>
        ))}
      </div>
      <p className="added" aria-live="polite">
        {last && (
          <>
            Added {last.grams} g.{' '}
            <button
              type="button"
              className="text-link"
              onClick={async () => {
                await removeProtein(last.id)
                setLast(null)
              }}
            >
              Undo
            </button>
          </>
        )}
      </p>

      <div>
        <h3 className="eyebrow">Tap a food to add it</h3>
        <div className="foods">
          {FOODS.map((f) => (
            <button type="button" key={f.name} className="food" onClick={() => add(f.grams)}>
              <span>
                {f.name}
                <small>{f.amount}</small>
              </span>
              <b>{f.grams}</b>
            </button>
          ))}
        </div>
        <p className="muted small">Grams of protein, roughly. Close enough is fine.</p>
      </div>

      <div className="entry-row">
        <NumInput label="Other amount in grams" value={custom} onChange={setCustom} placeholder="Other, g" className="big-num" />
        <button
          type="button"
          className="btn primary"
          disabled={!custom}
          onClick={async () => {
            await add(custom ?? 0)
            setCustom(null)
          }}
        >
          Add
        </button>
      </div>

      {todays.length > 0 && (
        <table className="log">
          <tbody>
            {[...todays].reverse().map((e) => (
              <tr key={e.id}>
                <th>{fmtTime(e.at)}</th>
                <td>{e.grams} g</td>
                <td className="end">
                  <ConfirmButton className="text-link danger" confirm="Delete?" onConfirm={() => removeProtein(e.id!)}>
                    ×
                  </ConfirmButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div>
        <Stepper
          label="Daily target"
          value={goal.grams}
          min={60}
          max={300}
          step={5}
          format={(v) => `${v} g`}
          onChange={(v) => void saveSettings({ proteinTarget: v })}
        />
        <p className="muted small">
          {goal.manual && goal.fromWeight ? (
            <>
              Set by you.{' '}
              <button type="button" className="text-link" onClick={() => void saveSettings({ proteinTarget: null })}>
                Use {goal.fromWeight} g from your weight
              </button>
            </>
          ) : goal.manual ? (
            'Set by you.'
          ) : goal.fromWeight ? (
            `${PROTEIN_PER_KG} g per kg of body weight, from your 7-day average. Protein is what turns training into muscle.`
          ) : (
            `Weigh in and this adjusts to ${PROTEIN_PER_KG} g per kg of your body weight.`
          )}
        </p>
      </div>
    </Sheet>
  )
}
