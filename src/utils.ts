export const sleep = async (sleepMillis: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, sleepMillis));

export const parseDate = (dateString: string): Date =>
  new Date(parseInt(dateString, 10));
