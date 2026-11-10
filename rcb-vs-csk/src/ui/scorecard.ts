import type { Innings, Match } from '../sim/match';

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/** Wagon wheel: the bowler's end is at the bottom, like the game camera. */
export function wagonWheel(inn: Innings): string {
  const R = 100;
  const cx = 110;
  const cy = 110;
  const by = cy - 14; // batter
  const lines: string[] = [];
  const count = { ones: 0, fours: 0, sixes: 0 };
  for (const b of inn.balls) {
    if (b.angle === undefined || b.dist === undefined || b.runsBat === 0) continue;
    const len = Math.min(1, b.dist / 70) * R * (b.boundary ? 1.02 : 1);
    let x = cx + Math.sin(b.angle) * len;
    let y = by + Math.cos(b.angle) * len;
    // Keep the line inside the boundary circle.
    const d = Math.hypot(x - cx, y - cy);
    if (d > R) {
      x = cx + ((x - cx) / d) * R;
      y = cy + ((y - cy) / d) * R;
    }
    const col = b.boundary === 6 ? '#d6a5ff' : b.boundary === 4 ? '#6fb3ff' : '#f4f5f7';
    const w = b.boundary ? 2.2 : 1.2;
    if (b.boundary === 6) count.sixes++;
    else if (b.boundary === 4) count.fours++;
    else count.ones++;
    lines.push(`<line x1="${cx}" y1="${by}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" opacity="${b.boundary ? 0.95 : 0.6}"/>`);
  }
  return `<div class="wagon">
    <svg viewBox="0 0 220 220" role="img" aria-label="Wagon wheel">
      <circle cx="${cx}" cy="${cy}" r="${R + 4}" fill="#0f3d1b" stroke="#f4f5f7" stroke-width="1.5"/>
      <ellipse cx="${cx}" cy="${cy}" rx="42" ry="56" fill="none" stroke="rgba(255,255,255,0.3)" stroke-dasharray="3 4"/>
      <rect x="${cx - 4}" y="${cy - 16}" width="8" height="32" fill="#cdb27a" rx="1"/>
      ${lines.join('')}
      <circle cx="${cx}" cy="${by}" r="2.6" fill="#ffd34d"/>
      <text x="${cx}" y="216" fill="#aab1c0" font-size="8" text-anchor="middle" font-weight="700">BOWLER'S END</text>
    </svg>
    <div class="legend">
      <div><i style="background:#f4f5f7"></i>1s, 2s, 3s: ${count.ones}</div>
      <div><i style="background:#6fb3ff"></i>Fours: ${count.fours}</div>
      <div><i style="background:#d6a5ff"></i>Sixes: ${count.sixes}</div>
    </div>
  </div>`;
}

export function scorecard(match: Match, inn: Innings): string {
  const team = match.team(inn.battingTeam);
  const rows = inn.bat
    .filter((b) => b.batted)
    .map((b) => {
      const pl = match.player(b.id);
      const sr = b.balls ? ((b.runs * 100) / b.balls).toFixed(0) : '-';
      const how = b.out ? b.how : b.balls > 0 || b.id === inn.strikerId || b.id === inn.nonStrikerId ? 'not out' : '';
      return `<tr><td><b>${esc(pl.name)}${pl.captain ? ' (c)' : ''}${pl.id === team.keeperId ? ' †' : ''}</b><span>${esc(how)}</span></td>
        <td class="r">${b.runs}</td><td>${b.balls}</td><td>${b.fours}</td><td>${b.sixes}</td><td>${sr}</td></tr>`;
    })
    .join('');
  const yet = inn.bat.filter((b) => !b.batted).map((b) => match.player(b.id).short);
  const ex = inn.extras;
  const exTotal = ex.wides + ex.noBalls + ex.byes + ex.legByes;
  const bowl = inn.bowl
    .filter((b) => b.balls > 0 || b.runs > 0)
    .map((b) => {
      const pl = match.player(b.id);
      const econ = b.balls ? ((b.runs * 6) / b.balls).toFixed(1) : '-';
      return `<tr><td><b>${esc(pl.name)}</b></td><td>${Math.floor(b.balls / 6)}.${b.balls % 6}</td><td>${b.maidens}</td><td>${b.runs}</td><td class="r">${b.wickets}</td><td>${econ}</td></tr>`;
    })
    .join('');
  const fow = inn.fow.map((f) => `${f.score}/${f.wicket} (${match.player(f.batterId).short}, ${Math.floor(f.balls / 6)}.${f.balls % 6})`).join(' · ');
  return `
    <div class="card">
      <h3>${esc(team.name)} batting</h3>
      <table class="sc"><thead><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr></thead><tbody>
      ${rows}
      <tr><td><b>Extras</b><span>w ${ex.wides}, nb ${ex.noBalls}, b ${ex.byes}, lb ${ex.legByes}</span></td><td class="r">${exTotal}</td><td colspan="4"></td></tr>
      <tr class="tot"><td>Total</td><td colspan="5">${inn.score}/${inn.wickets} (${match.oversText(inn)} ov, RR ${match.runRate(inn).toFixed(2)})</td></tr>
      </tbody></table>
      ${yet.length ? `<div class="fow">Did not bat: ${esc(yet.join(', '))}</div>` : ''}
      ${fow ? `<div class="fow">Fall of wickets: ${esc(fow)}</div>` : ''}
    </div>
    <div class="card">
      <h3>${esc(match.team(inn.bowlingTeam).name)} bowling</h3>
      <table class="sc"><thead><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr></thead><tbody>${bowl}</tbody></table>
    </div>
    <div class="card"><h3>Wagon wheel: ${esc(team.short)}</h3>${wagonWheel(inn)}</div>`;
}
