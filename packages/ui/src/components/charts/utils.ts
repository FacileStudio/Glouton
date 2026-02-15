export interface Scale {
    domain: [number, number];
    range: [number, number];
}

/**
 * scaleLinear
 */
export function scaleLinear(domain: [number, number], range: [number, number]) {
    /**
     * return
     */
    return (value: number): number => {
        const [d0, d1] = domain;
        const [r0, r1] = range;
        return r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
    };
}

/**
 * scaleBand
 */
export function scaleBand(domain: string[], range: [number, number], padding = 0.1) {
    /**
     * step
     */
    const step = (range[1] - range[0]) / domain.length;
    const bandwidth = step * (1 - padding);
    const paddingSize = step * padding;

    return {
        scale: (value: string): number => {
            const index = domain.indexOf(value);
            return range[0] + index * step + paddingSize / 2;
        },
        bandwidth,
    };
}

/**
 * extent
 */
export function extent(data: number[]): [number, number] {
    /**
     * if
     */
    if (data.length === 0) return [0, 0];
    return [Math.min(...data), Math.max(...data)];
}

/**
 * nice
 */
export function nice(value: number, round: boolean = false): number {
    const exponent = Math.floor(Math.log10(Math.abs(value)));
    const fraction = value / Math.pow(10, exponent);
    let niceFraction: number;

    /**
     * if
     */
    if (round) {
        /**
         * if
         */
        if (fraction < 1.5) niceFraction = 1;
        else if (fraction < 3) niceFraction = 2;
        else if (fraction < 7) niceFraction = 5;
        else niceFraction = 10;
    } else {
        /**
         * if
         */
        if (fraction <= 1) niceFraction = 1;
        else if (fraction <= 2) niceFraction = 2;
        else if (fraction <= 5) niceFraction = 5;
        else niceFraction = 10;
    }

    return niceFraction * Math.pow(10, exponent);
}

/**
 * ticks
 */
export function ticks(domain: [number, number], count = 5): number[] {
    const [min, max] = domain;
    const span = max - min;

    /**
     * if
     */
    if (span === 0) return [min];

    const step = nice(span / (count - 1), false);
    const start = Math.floor(min / step) * step;
    const end = Math.ceil(max / step) * step;

    const result: number[] = [];
    /**
     * for
     */
    for (let i = start; i <= end; i += step) {
        /**
         * if
         */
        if (i >= min && i <= max) {
            result.push(i);
        }
    }

    return result.length > 0 ? result : [min, max];
}

/**
 * formatNumber
 */
export function formatNumber(value: number): string {
    /**
     * if
     */
    if (Math.abs(value) >= 1e9) {
        /**
         * return
         */
        return (value / 1e9).toFixed(1) + 'B';
    }
    /**
     * if
     */
    if (Math.abs(value) >= 1e6) {
        /**
         * return
         */
        return (value / 1e6).toFixed(1) + 'M';
    }
    /**
     * if
     */
    if (Math.abs(value) >= 1e3) {
        /**
         * return
         */
        return (value / 1e3).toFixed(1) + 'K';
    }
    return value.toFixed(0);
}
