import { useState } from 'react'
import { useFocusStats } from '../hooks/useFocusStats'
import { FocusStatsView } from '../components/FocusStatsView'

const RANGE_OPTIONS = [
  { label: '過去7日間', days: 7 },
  { label: '過去30日間', days: 30 },
]

export function SelfViewPage({ orgId, userId }: { orgId: string; userId: string }) {
  const [sinceDays, setSinceDays] = useState(7)
  const { totals, loading } = useFocusStats(orgId, userId, sinceDays)

  return (
    <div>
      <div className="range-picker">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            className={sinceDays === opt.days ? 'range-option range-option--active' : 'range-option'}
            onClick={() => setSinceDays(opt.days)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <FocusStatsView title="あなたの集中スタッツ" totals={totals} loading={loading} />
      <p className="hint">
        ここに表示されている内容は、管理者があなたについて見られる情報と完全に同じです。それ以外は一切共有されません。
      </p>
    </div>
  )
}
