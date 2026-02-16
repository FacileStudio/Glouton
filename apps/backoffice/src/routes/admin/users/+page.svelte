<script lang="ts">
	import { trpc } from '$lib/trpc';
	import { onMount } from 'svelte';
	import UserDetailModal from '$lib/components/UserDetailModal.svelte';
	import { Spinner, SearchInput, Badge, EmptyState } from '@repo/ui';
	import { logger } from '@repo/logger';
	import type { User, UserStats } from '$lib/types';
	import 'iconify-icon';

	let pageLoading = $state(true);
	let users: User[] = $state([]);
	let stats: UserStats | null = $state(null);
	let searchQuery = $state('');
	let selectedUserId = $state('');
	let banningUserId = $state('');
	let banReason = $state('');

	let filters = $state({
		status: 'all' as 'all' | 'active' | 'suspended' | 'banned' | 'pending',
		role: 'all' as 'all' | 'admin' | 'user',
	});

	onMount(async () => {
		await Promise.all([fetchUsers(), fetchStats()]);
	});

	async function fetchUsers() {
		pageLoading = true;
		try {
			users = await trpc.user.list.query(filters);
		} catch (err) {
			logger.error({ err }, 'Failed to fetch users');
		} finally {
			pageLoading = false;
		}
	}

	async function fetchStats() {
		try {
			stats = await trpc.user.getStats.query();
		} catch (err) {
			logger.error({ err }, 'Failed to fetch user statistics');
		}
	}

	$effect(() => {
		fetchUsers();
	});

	const handleDelete = async (id: string, name: string) => {
		if (!confirm(`Delete ${name}? This action cannot be undone.`)) return;
		try {
			await trpc.user.delete.mutate({ id });
			users = users.filter(u => u.id !== id);
			await fetchStats();
		} catch (err) {
			logger.error({ err }, 'Failed to delete user');
			alert('Failed to delete user');
		}
	};

	const handleTogglePremium = async (id: string, current: boolean) => {
		try {
			await trpc.user.update.mutate({ id, isPremium: !current });
			users = users.map(u => u.id === id ? { ...u, isPremium: !current } : u);
		} catch (err) {
			logger.error({ err }, 'Failed to update premium status');
			alert('Failed to update premium status');
		}
	};

	const handleToggleRole = async (id: string, currentRole: string) => {
		const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
		try {
			await trpc.user.update.mutate({ id, role: newRole });
			users = users.map(u => u.id === id ? { ...u, role: newRole } : u);
		} catch (err) {
			logger.error({ err }, 'Failed to update user role');
			alert('Failed to update role');
		}
	};

	const handleBan = async (userId: string) => {
		if (!banReason.trim()) {
			alert('Please provide a ban reason');
			return;
		}
		try {
			await trpc.user.ban.mutate({ id: userId, reason: banReason });
			await fetchUsers();
			await fetchStats();
			banningUserId = '';
			banReason = '';
		} catch (err) {
			logger.error({ err }, 'Failed to ban user');
			alert('Failed to ban user');
		}
	};

	const handleUnban = async (id: string) => {
		if (!confirm('Unban this user?')) return;
		try {
			await trpc.user.unban.mutate({ id });
			await fetchUsers();
			await fetchStats();
		} catch (err) {
			logger.error({ err }, 'Failed to unban user');
			alert('Failed to unban user');
		}
	};

	const handleVerifyEmail = async (id: string) => {
		try {
			await trpc.user.verifyEmail.mutate({ id });
			users = users.map(u => u.id === id ? { ...u, emailVerified: true } : u);
		} catch (err) {
			logger.error({ err }, 'Failed to verify email');
			alert('Failed to verify email');
		}
	};

	function getStatusColor(status: string) {
		switch (status) {
			case 'ACTIVE': return 'emerald';
			case 'BANNED': return 'rose';
			case 'SUSPENDED': return 'amber';
			case 'PENDING': return 'slate';
			default: return 'slate';
		}
	}

	function formatDate(date: Date | string | null) {
		if (!date) return '-';
		return new Date(date).toLocaleDateString();
	}

	let searchTerm = $derived(searchQuery.toLowerCase().trim());
	let filteredUsers = $derived(users.filter(user => {
		if (!searchTerm) return true;
		const searchContent = `${user.firstName} ${user.lastName} ${user.email} ${user.id}`.toLowerCase();
		return searchTerm.split(' ').every(word => searchContent.includes(word));
	}));
</script>

<div class="p-8 max-w-[1400px] mx-auto space-y-6">
	<header>
		<h1 class="text-3xl font-black tracking-tighter" style="color: #291334;">Members</h1>
		<p class="text-sm mt-1" style="color: rgba(41, 19, 52, 0.6);">Manage and moderate platform members</p>
	</header>

	{#if stats}
		<div class="grid grid-cols-4 gap-4">
			<div class="rounded-2xl p-4 shadow-lg" style="background-color: #EFEAE6;">
				<div class="flex items-center justify-between mb-2">
					<div class="text-xs font-bold">Total</div>
					<iconify-icon icon="solar:users-group-two-rounded-bold-duotone" width="20" style="color: rgba(41, 19, 52, 0.5);"></iconify-icon>
				</div>
				<div class="text-2xl font-black" style="color: #291334;">{stats.totalUsers}</div>
			</div>
			<div class="rounded-2xl p-4 shadow-lg" style="background-color: #EFEAE6;">
				<div class="flex items-center justify-between mb-2">
					<div class="text-xs font-bold text-emerald-600">Active</div>
					<iconify-icon icon="solar:user-check-rounded-bold-duotone" class="text-emerald-600" width="20"></iconify-icon>
				</div>
				<div class="text-2xl font-black text-emerald-600">{stats.activeUsers}</div>
			</div>
			<div class="rounded-2xl p-4 shadow-lg" style="background-color: #EFEAE6;">
				<div class="flex items-center justify-between mb-2">
					<div class="text-xs font-bold text-amber-600">Suspended</div>
					<iconify-icon icon="solar:user-block-rounded-bold-duotone" class="text-amber-600" width="20"></iconify-icon>
				</div>
				<div class="text-2xl font-black text-amber-600">{stats.suspendedUsers}</div>
			</div>
			<div class="rounded-2xl p-4 shadow-lg" style="background-color: #EFEAE6;">
				<div class="flex items-center justify-between mb-2">
					<div class="text-xs font-bold text-rose-600">Banned</div>
					<iconify-icon icon="solar:user-cross-rounded-bold-duotone" class="text-rose-600" width="20"></iconify-icon>
				</div>
				<div class="text-2xl font-black text-rose-600">{stats.bannedUsers}</div>
			</div>
		</div>
	{/if}

	<div class="rounded-2xl p-4 shadow-lg" style="background-color: #EFEAE6;">
		<div class="flex gap-3 items-center">
			<div class="flex-1">
				<SearchInput bind:value={searchQuery} placeholder="Search by name, email..." />
			</div>
			<select
				bind:value={filters.status}
				class="px-4 py-2 rounded-xl outline-none font-bold text-sm shadow-lg"
				style="background-color: #FAF7F5; color: #291334;"
			>
				<option value="all">All Status</option>
				<option value="active">Active</option>
				<option value="suspended">Suspended</option>
				<option value="banned">Banned</option>
				<option value="pending">Pending</option>
			</select>
			<select
				bind:value={filters.role}
				class="px-4 py-2 rounded-xl outline-none font-bold text-sm shadow-lg"
				style="background-color: #FAF7F5; color: #291334;"
			>
				<option value="all">All Roles</option>
				<option value="admin">Admin</option>
				<option value="user">User</option>
			</select>
		</div>
	</div>

	{#if pageLoading}
		<div class="py-20 flex justify-center">
			<Spinner size="xl" />
		</div>
	{:else if filteredUsers.length > 0}
		<div class="rounded-2xl overflow-hidden shadow-lg" style="background-color: #EFEAE6;">
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead style="background-color: rgba(41, 19, 52, 0.05);">
						<tr>
							<th class="text-left px-6 py-3 text-xs font-black">User</th>
							<th class="text-left px-6 py-3 text-xs font-black">Status</th>
							<th class="text-left px-6 py-3 text-xs font-black">Role</th>
							<th class="text-left px-6 py-3 text-xs font-black">Joined</th>
							<th class="text-right px-6 py-3 text-xs font-black">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredUsers as user (user.id)}
							<tr class="transition-colors" style="border-bottom: 1px solid rgba(41, 19, 52, 0.1);">
								<td class="px-6 py-4">
									<div class="flex items-center gap-3">
										<div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold" style="background-color: rgba(254, 193, 41, 0.15); color: #FEC129;">
											{user.firstName[0]}
										</div>
										<div>
											<div class="font-bold flex items-center gap-2" style="color: #291334;">
												{user.firstName} {user.lastName}
												{#if user.emailVerified}
													<iconify-icon icon="solar:verified-check-bold-duotone" class="text-emerald-500" width="16"></iconify-icon>
												{/if}
												{#if user.isPremium}
													<iconify-icon icon="solar:crown-bold-duotone" width="16" style="color: #FEC129;"></iconify-icon>
												{/if}
											</div>
											<div class="text-sm" style="color: rgba(41, 19, 52, 0.6);">{user.email}</div>
										</div>
									</div>
								</td>
								<td class="px-6 py-4">
									<Badge variant={getStatusColor(user.status || 'ACTIVE')}>
										{user.status || 'ACTIVE'}
									</Badge>
								</td>
								<td class="px-6 py-4">
									<button
										onclick={() => handleToggleRole(user.id, user.role)}
										class="px-3 py-1 rounded-lg text-xs font-bold transition-colors shadow-lg {user.role === 'ADMIN' ? 'bg-rose-100 text-rose-700' : ''}"
										style="{user.role === 'ADMIN' ? '' : 'background-color: #EFEAE6; color: #291334;'}"
									>
										{user.role}
									</button>
								</td>
								<td class="px-6 py-4 text-sm" style="color: rgba(41, 19, 52, 0.7);">
									{formatDate(user.createdAt)}
								</td>
								<td class="px-6 py-4">
									<div class="flex items-center justify-end gap-2">
										<button
											onclick={() => selectedUserId = user.id}
											class="p-2 rounded-lg transition-colors"
											style="color: rgba(41, 19, 52, 0.4);"
											title="View details"
										>
											<iconify-icon icon="solar:eye-bold-duotone" width="18"></iconify-icon>
										</button>

										{#if !user.emailVerified}
											<button
												onclick={() => handleVerifyEmail(user.id)}
												class="p-2 rounded-lg transition-colors text-emerald-600"
												title="Verify email"
											>
												<iconify-icon icon="solar:shield-check-bold-duotone" width="18"></iconify-icon>
											</button>
										{/if}

										<button
											onclick={() => handleTogglePremium(user.id, user.isPremium)}
											class="p-2 rounded-lg transition-colors"
											style="color: #FEC129;"
											title={user.isPremium ? 'Remove premium' : 'Make premium'}
										>
											<iconify-icon icon="solar:star-bold-duotone" width="18"></iconify-icon>
										</button>

										{#if user.isBanned}
											<button
												onclick={() => handleUnban(user.id)}
												class="p-2 rounded-lg transition-colors text-emerald-600"
												title="Unban user"
											>
												<iconify-icon icon="solar:shield-check-bold-duotone" width="18"></iconify-icon>
											</button>
										{:else}
											<button
												onclick={() => {
													banningUserId = user.id;
													banReason = '';
												}}
												class="p-2 rounded-lg transition-colors text-rose-600"
												title="Ban user"
											>
												<iconify-icon icon="solar:shield-warning-bold-duotone" width="18"></iconify-icon>
											</button>
										{/if}

										<button
											onclick={() => handleDelete(user.id, `${user.firstName} ${user.lastName}`)}
											class="p-2 rounded-lg transition-colors text-rose-600"
											title="Delete user"
										>
											<iconify-icon icon="solar:trash-bin-trash-bold-duotone" width="18"></iconify-icon>
										</button>
									</div>
								</td>
							</tr>

							{#if banningUserId === user.id}
								<tr class="bg-rose-50">
									<td colspan="5" class="px-6 py-4">
										<div class="flex items-center gap-3">
											<iconify-icon icon="solar:shield-warning-bold-duotone" class="text-rose-600" width="20"></iconify-icon>
											<input
												type="text"
												bind:value={banReason}
												placeholder="Enter ban reason..."
												class="flex-1 px-4 py-2 rounded-xl outline-none shadow-lg"
												style="background-color: #EFEAE6;"
												onkeydown={(e) => {
													if (e.key === 'Enter') handleBan(user.id);
													if (e.key === 'Escape') banningUserId = '';
												}}
											/>
											<button
												onclick={() => handleBan(user.id)}
												class="px-4 py-2 text-white rounded-xl font-bold text-sm transition-colors shadow-lg bg-rose-600"
											>
												Ban User
											</button>
											<button
												onclick={() => {
													banningUserId = '';
													banReason = '';
												}}
												class="px-4 py-2 rounded-xl font-bold text-sm transition-colors shadow-lg"
												style="background-color: #EFEAE6; color: #291334;"
											>
												Cancel
											</button>
										</div>
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			</div>
		</div>

		<div class="text-sm text-center" style="color: rgba(41, 19, 52, 0.5);">
			Showing {filteredUsers.length} of {users.length} users
		</div>
	{:else}
		<EmptyState
			icon="solar:users-group-two-rounded-bold-duotone"
			title="No users found"
			description="Try adjusting your filters or search query"
		/>
	{/if}
</div>

<UserDetailModal
	bind:userId={selectedUserId}
	onClose={() => {
		selectedUserId = '';
		fetchUsers();
		fetchStats();
	}}
/>
