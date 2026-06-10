import { Router } from 'express';
import {
	ALLOCATION_STRATEGIES,
	getAllocationConfig,
	getOrderedActiveAccounts,
	setAllocationConfig,
} from '../services/allocationService.js';

const router = Router();

function serializeAccount(account) {
	const total = Number(account.total_space) || 0;
	const used = Number(account.used_space) || 0;
	return {
		id: account.id,
		email: account.email,
		provider: account.provider,
		total_space: total,
		used_space: used,
		free_space: Math.max(0, total - used),
	};
}

router.get('/allocation', (_req, res) => {
	try {
		const config = getAllocationConfig();
		res.json({
			data: {
				strategy: config.strategy,
				strategies: ALLOCATION_STRATEGIES,
				accounts: getOrderedActiveAccounts().map(serializeAccount),
			},
		});
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

router.patch('/allocation', (req, res) => {
	try {
		const { strategy, order } = req.body || {};
		const updated = setAllocationConfig({ strategy, order });
		res.json({
			data: {
				strategy: updated.strategy,
				strategies: ALLOCATION_STRATEGIES,
				accounts: getOrderedActiveAccounts().map(serializeAccount),
			},
		});
	} catch (error) {
		res.status(400).json({ error: error.message });
	}
});

export default router;
