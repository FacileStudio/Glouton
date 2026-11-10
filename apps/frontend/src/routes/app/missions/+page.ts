import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import { redirectFor } from '$lib/usage/nav';

export const load: PageLoad = ({ url }) => redirect(308, redirectFor(url.pathname, url.search) ?? '/app/prospects');
