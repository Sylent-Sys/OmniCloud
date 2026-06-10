import { db } from '../config/database.js';
import { getActiveAccounts } from './accountService.js';

export const ALLOCATION_STRATEGIES = [
	'round_robin',
	'weighted_round_robin',
	'least_used',
	'most_free',
	'manual',
];

export const DEFAULT_STRATEGY = 'round_robin';

const SETTING_KEYS = {
	strategy: 'allocation_strategy',
	order: 'allocation_order',
	rrCursor: 'allocation_rr_cursor',
	swrrState: 'allocation_swrr_state',
};

function readSetting(key) {
	const row = db.prepare('SELECT value FROM user_settings WHERE key = ?').get(key);
	return row ? row.value : null;
}

function writeSetting(key, value) {
	db.prepare(`
		INSERT INTO user_settings (key, value, updated_at)
		VALUES (?, ?, CURRENT_TIMESTAMP)
		ON CONFLICT(key) DO UPDATE SET
			value = excluded.value,
			updated_at = CURRENT_TIMESTAMP
	`).run(key, value);
}

function parseJson(value, fallback) {
	if (!value) return fallback;
	try {
		const parsed = JSON.parse(value);
		return parsed ?? fallback;
	} catch {
		return fallback;
	}
}

export function getAllocationConfig() {
	const strategyRaw = readSetting(SETTING_KEYS.strategy);
	const strategy = ALLOCATION_STRATEGIES.includes(strategyRaw) ? strategyRaw : DEFAULT_STRATEGY;
	const order = parseJson(readSetting(SETTING_KEYS.order), []).filter((id) => typeof id === 'string');

	return { strategy, order };
}

export function getOrderedActiveAccounts() {
	const active = getActiveAccounts();
	const { order } = getAllocationConfig();
	const byId = new Map(active.map((account) => [account.id, account]));

	const ordered = [];
	order.forEach((id) => {
		if (byId.has(id)) {
			ordered.push(byId.get(id));
			byId.delete(id);
		}
	});

	[...byId.values()]
		.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
		.forEach((account) => ordered.push(account));

	return ordered;
}

export function setAllocationConfig({ strategy, order } = {}) {
	const current = getAllocationConfig();
	let nextStrategy = current.strategy;
	let nextOrder = current.order;
	let shouldReset = false;

	if (strategy !== undefined) {
		if (!ALLOCATION_STRATEGIES.includes(strategy)) {
			throw new Error(`Invalid allocation strategy: ${strategy}`);
		}
		if (strategy !== current.strategy) {
			shouldReset = true;
		}
		nextStrategy = strategy;
		writeSetting(SETTING_KEYS.strategy, strategy);
	}

	if (order !== undefined) {
		if (!Array.isArray(order) || order.some((id) => typeof id !== 'string')) {
			throw new Error('Allocation order must be an array of account ids');
		}
		shouldReset = true;
		nextOrder = order;
		writeSetting(SETTING_KEYS.order, JSON.stringify(order));
	}

	if (shouldReset) {
		resetRotationState();
	}

	return { strategy: nextStrategy, order: nextOrder };
}

export function resetRotationState() {
	writeSetting(SETTING_KEYS.rrCursor, '0');
	writeSetting(SETTING_KEYS.swrrState, '{}');
}

export function getRoundRobinCursor() {
	return Number(readSetting(SETTING_KEYS.rrCursor)) || 0;
}

export function setRoundRobinCursor(cursor) {
	writeSetting(SETTING_KEYS.rrCursor, String(cursor));
}

export function getSwrrState() {
	return parseJson(readSetting(SETTING_KEYS.swrrState), {});
}

export function setSwrrState(state) {
	writeSetting(SETTING_KEYS.swrrState, JSON.stringify(state || {}));
}
