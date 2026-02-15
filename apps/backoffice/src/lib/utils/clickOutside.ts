export function clickOutside(node: HTMLElement, callback: () => void) {
  /**
   * handleClick
   */
  const handleClick = (event: MouseEvent) => {
    /**
     * if
     */
    if (node && !node.contains(event.target as Node) && !event.defaultPrevented) {
      /**
       * callback
       */
      callback();
    }
  };

  document.addEventListener('click', handleClick, true);

  return {
    /**
     * destroy
     */
    destroy() {
      document.removeEventListener('click', handleClick, true);
    },
  };
}
