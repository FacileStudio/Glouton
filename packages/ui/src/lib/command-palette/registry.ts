export interface Command {
	id: string;
	label: string;
	description?: string;
	icon?: string;
	shortcut?: string;
	category?: string;
	action: () => void | Promise<void>;
	keywords?: string[];
}

class CommandRegistry {
	private commands: Map<string, Command> = new Map();
	private listeners: Set<() => void> = new Set();

	/**
	 * register
	 */
	register(command: Command): void {
		this.commands.set(command.id, command);
		this.notifyListeners();
	}

	/**
	 * registerMultiple
	 */
	registerMultiple(commands: Command[]): void {
		commands.forEach(cmd => this.commands.set(cmd.id, cmd));
		this.notifyListeners();
	}

	/**
	 * unregister
	 */
	unregister(id: string): void {
		this.commands.delete(id);
		this.notifyListeners();
	}

	/**
	 * clear
	 */
	clear(): void {
		this.commands.clear();
		this.notifyListeners();
	}

	/**
	 * get
	 */
	get(id: string): Command | undefined {
		return this.commands.get(id);
	}

	/**
	 * getAll
	 */
	getAll(): Command[] {
		return Array.from(this.commands.values());
	}

	/**
	 * getByCategory
	 */
	getByCategory(category: string): Command[] {
		return this.getAll().filter(cmd => cmd.category === category);
	}

	/**
	 * search
	 */
	search(query: string): Command[] {
		/**
		 * if
		 */
		if (!query.trim()) return this.getAll();

		const lowerQuery = query.toLowerCase();
		return this.getAll().filter(cmd => {
			const searchText = [
				cmd.label,
				cmd.description || '',
				cmd.category || '',
				...(cmd.keywords || [])
			].join(' ').toLowerCase();

			return searchText.includes(lowerQuery);
		}).sort((a, b) => {
			const aLabel = a.label.toLowerCase();
			const bLabel = b.label.toLowerCase();
			const aStarts = aLabel.startsWith(lowerQuery);
			const bStarts = bLabel.startsWith(lowerQuery);

			/**
			 * if
			 */
			if (aStarts && !bStarts) return -1;
			/**
			 * if
			 */
			if (!aStarts && bStarts) return 1;
			return aLabel.localeCompare(bLabel);
		});
	}

	/**
	 * subscribe
	 */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		/**
		 * return
		 */
		return () => this.listeners.delete(listener);
	}

	/**
	 * notifyListeners
	 */
	private notifyListeners(): void {
		this.listeners.forEach(listener => listener());
	}
}

export const commandRegistry = new CommandRegistry();
