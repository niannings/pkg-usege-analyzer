import path from 'path';

export const formatPath = (p: string) => path.relative(__dirname, p);
