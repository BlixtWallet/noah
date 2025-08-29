import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export const formatNumber = (num: number | string) => {
  const numStr = num.toString();
  const parts = numStr.split(".");

  // Add commas to the integer part only
  parts[0] = parts[0].replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");

  // Join back with decimal part if it exists
  return parts.join(".");
};

export const satsToBtc = (sats: number) => {
  return sats / 100_000_000;
};
