<script lang="ts">
	import { AdminAutoStats } from '@repo/ui';
	import { trpc } from '$lib/trpc';
	import { onMount } from 'svelte';
	import { logger } from '@repo/logger';
	import type { UserStats } from '$lib/types';

	let loading = $state(true);
	let userStats: UserStats | null = $state(null);
	let leadStats: any | null = $state(null);

	/**
	 * onMount
	 */
	onMount(async () => {
		await Promise.all([fetchUserStats(), fetchLeadStats()]);
		loading = false;
	});

	/**
	 * fetchUserStats
	 */
	async function fetchUserStats() {
		try {
			userStats = await trpc.user.getStats.query();
		} catch (err) {
			logger.error({ err }, 'Failed to fetch user statistics');
		}
	}

	/**
	 * fetchLeadStats
	 */
	async function fetchLeadStats() {
		try {
			leadStats = await trpc.lead.query.getStats.query();
		} catch (err) {
			logger.error({ err }, 'Failed to fetch lead statistics');
		}
	}

	const stats = $derived(() => {
		const statsList = [];

		/**
		 * if
		 */
		if (userStats) {
			statsList.push(
				{
					title: 'Total Users',
					value: userStats.totalUsers || 0,
					icon: 'solar:users-group-two-rounded-bold-duotone',
					color: 'indigo' as const,
				},
				{
					title: 'Active Users',
					value: userStats.activeUsers || 0,
					icon: 'solar:user-check-rounded-bold-duotone',
					color: 'emerald' as const,
				}
			);
		}

		/**
		 * if
		 */
		if (leadStats) {
			statsList.push(
				{
					title: 'Total Leads',
					value: leadStats.totalLeads || 0,
					icon: 'solar:user-id-bold-duotone',
					color: 'blue' as const,
				},
				{
					title: 'Hot Leads',
					value: leadStats.hotLeads || 0,
					icon: 'solar:fire-bold-duotone',
					color: 'rose' as const,
				},
				{
					title: 'Warm Leads',
					value: leadStats.warmLeads || 0,
					icon: 'solar:star-bold-duotone',
					color: 'amber' as const,
				},
				{
					title: 'Cold Leads',
					value: leadStats.coldLeads || 0,
					icon: 'solar:snowflake-bold-duotone',
					color: 'cyan' as const,
				},
				{
					title: 'Active Hunts',
					value: (leadStats.pendingHunts || 0) + (leadStats.processingHunts || 0),
					icon: 'solar:magnifer-zoom-in-bold-duotone',
					color: 'violet' as const,
				},
				{
					title: 'Success Rate',
					value: leadStats.successRate ? `${leadStats.successRate.toFixed(1)}%` : '0%',
					icon: 'solar:chart-bold-duotone',
					color: 'emerald' as const,
				}
			);
		}

		return statsList;
	});

	const leadStatusDistribution = $derived(() => {
		/**
		 * if
		 */
		if (!leadStats) return [];
		return [
			{ label: 'Hot', value: leadStats.hotLeads || 0 },
			{ label: 'Warm', value: leadStats.warmLeads || 0 },
			{ label: 'Cold', value: leadStats.coldLeads || 0 },
		];
	});

	const userStatusDistribution = $derived(() => {
		/**
		 * if
		 */
		if (!userStats) return [];
		return [
			{ label: 'Active', value: userStats.activeUsers || 0 },
			{ label: 'Suspended', value: userStats.suspendedUsers || 0 },
			{ label: 'Banned', value: userStats.bannedUsers || 0 },
		];
	});

	const charts = $derived(() => {
		const chartList = [];

		/**
		 * if
		 */
		if (leadStatusDistribution().some((d) => d.value > 0)) {
			chartList.push({
				title: 'Lead Quality Distribution',
				description: 'Breakdown of leads by status (Hot, Warm, Cold)',
				type: 'pie' as const,
				data: leadStatusDistribution(),
				value: 'value',
				label: 'label',
				colors: ['#ef4444', '#f59e0b', '#06b6d4'],
				height: 300,
			});
		}

		/**
		 * if
		 */
		if (userStatusDistribution().some((d) => d.value > 0)) {
			chartList.push({
				title: 'User Status Distribution',
				description: 'Breakdown of users by status',
				type: 'bar' as const,
				data: userStatusDistribution(),
				x: 'label',
				y: 'value',
				color: '#4f46e5',
				height: 300,
			});
		}

		return chartList;
	});
</script>

<div class="p-8 max-w-[1400px] mx-auto">
	{#if loading}
		<div class="flex items-center justify-center py-20">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
		</div>
	{:else}
		<AdminAutoStats
			title="Lead Generation Statistics"
			description="Overview of lead hunting metrics and user activity"
			stats={stats()}
			charts={charts()}
		/>
	{/if}
</div>
