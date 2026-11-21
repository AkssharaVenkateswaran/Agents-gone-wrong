// tactics.js
// Otto learns from everyone's games (GET /api/tactics, see SNOWFLAKE_SMART.md).
// The crowd's stats only WEIGHT Otto's choices; every existing rule (cooldowns,
// balance, fairness) still decides what's allowed first, and the choice stays random.
//
//   weight = 1 + score / 100
//   cheats: score = 0.5 x land rate + 0.5 x Otto's win rate in matches it was used
//   rules:  score = Otto's win rate in matches where the rule appeared
//   fewer than 3 attempts / matches -> weight 1 (neutral)

export const MIN_SAMPLES = 3;

export function cheatScore(tactics, id) {
  const stats = tactics?.cheats?.[id];
  if (!stats || stats.attempts < MIN_SAMPLES) return null;
  return 0.5 * stats.landRate + 0.5 * stats.ottoWinRate;
}

export function ruleScore(tactics, id) {
  const stats = tactics?.rules?.[id];
  if (!stats || stats.matches < MIN_SAMPLES) return null;
  return stats.ottoWinRate;
}

export const weightOf = (score) => (score === null ? 1 : 1 + score / 100);

// Pick one item at random, where items with a bigger weight are more likely.
export function weightedPick(items, weight) {
  const weights = items.map(weight);
  let roll = Math.random() * weights.reduce((sum, w) => sum + w, 0);
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

// Pick up to `count` different items, each pick weighted.
export function weightedSample(items, count, weight) {
  const pool = items.slice();
  const picked = [];
  while (picked.length < count && pool.length > 0) {
    const item = weightedPick(pool, weight);
    picked.push(item);
    pool.splice(pool.indexOf(item), 1);
  }
  return picked;
}

// What Otto's terminal shows when the crowd's data shaped its choice.
export function cheatReasoning(tactics, cheat) {
  const stats = tactics.cheats[cheat.id];
  return `OTTO@AGENT:~$ snowflake.query --best-cheat\n> ${cheat.id} lands ${stats.landRate}% of the time on humans. ${cheat.name.toLowerCase()}.`;
}

export function ruleReasoning(tactics, rule) {
  const stats = tactics.rules[rule.id];
  return `OTTO@AGENT:~$ snowflake.query --best-rule\n> "${rule.name}" wins me ${stats.ottoWinRate}% of matches. ${rule.name.toLowerCase()} it is.`;
}
