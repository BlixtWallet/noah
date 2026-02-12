import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getLnurlDomain } from "~/constants";
import { getLightningAddressSuggestions } from "~/lib/api";
import { useServerStore } from "~/store/serverStore";
import logger from "~/lib/log";

const log = logger("useLightningAddressSuggestions");

const MIN_USERNAME_LENGTH = 2;
const MAX_BARE_USERNAME_LENGTH = 32;
const SUGGESTION_DEBOUNCE_MS = 300;
const USERNAME_PARTIAL_REGEX = /^[a-z0-9_.-]+$/;
const DOMAIN_PARTIAL_REGEX = /^[a-z0-9.-]*$/;
const BARE_USERNAME_START_REGEX = /^[a-z]/;
const NON_LN_PREFIXES = ["bc1", "tb1", "bcrt1", "lnbc", "lntb", "lnbcrt"];
const LNURL_DOMAIN = getLnurlDomain().toLowerCase();

type UseLightningAddressSuggestionsParams = {
  destination: string;
  isDestinationFocused: boolean;
};

const normalizeDestination = (destination: string): string => {
  return destination
    .trim()
    .toLowerCase()
    .replace(/^lightning:/, "");
};

const getSuggestionQueryCandidate = (destination: string): string | null => {
  const normalized = normalizeDestination(destination);

  if (!normalized) {
    return null;
  }

  const atCount = normalized.split("@").length - 1;
  if (atCount > 1) {
    return null;
  }

  const [username, domainPrefix] = normalized.split("@");

  if (
    !username ||
    username.length < MIN_USERNAME_LENGTH ||
    !USERNAME_PARTIAL_REGEX.test(username)
  ) {
    return null;
  }

  if (domainPrefix === undefined) {
    if (username.length > MAX_BARE_USERNAME_LENGTH) {
      return null;
    }

    if (!BARE_USERNAME_START_REGEX.test(username)) {
      return null;
    }

    if (NON_LN_PREFIXES.some((prefix) => username.startsWith(prefix))) {
      return null;
    }
  }

  if (domainPrefix !== undefined) {
    if (!DOMAIN_PARTIAL_REGEX.test(domainPrefix)) {
      return null;
    }

    if (!LNURL_DOMAIN.startsWith(domainPrefix)) {
      return null;
    }
  }

  return normalized;
};

export const useLightningAddressSuggestions = ({
  destination,
  isDestinationFocused,
}: UseLightningAddressSuggestionsParams) => {
  const ownLightningAddress = useServerStore((state) => state.lightningAddress);
  const ownLightningAddressNormalized = ownLightningAddress?.toLowerCase() ?? null;

  const queryCandidate = useMemo(() => getSuggestionQueryCandidate(destination), [destination]);
  const [debouncedQuery, setDebouncedQuery] = useState<string | null>(null);

  useEffect(() => {
    if (!isDestinationFocused || !queryCandidate) {
      setDebouncedQuery(null);
      return;
    }

    const timeout = setTimeout(() => {
      setDebouncedQuery(queryCandidate);
    }, SUGGESTION_DEBOUNCE_MS);

    return () => {
      clearTimeout(timeout);
    };
  }, [isDestinationFocused, queryCandidate]);

  const query = useQuery({
    queryKey: ["lnAddressSuggestions", debouncedQuery],
    queryFn: async () => {
      if (!debouncedQuery) {
        return [];
      }

      const result = await getLightningAddressSuggestions({ query: debouncedQuery });
      if (result.isErr()) {
        throw result.error;
      }

      return result.value.suggestions;
    },
    enabled: isDestinationFocused && debouncedQuery !== null,
    staleTime: 30 * 1000,
    retry: false,
  });

  useEffect(() => {
    if (!query.error) {
      return;
    }

    log.w("Failed to fetch lightning address suggestions", [query.error]);
  }, [query.error]);

  const suggestions = useMemo(() => {
    if (!isDestinationFocused) {
      return [];
    }

    const values = query.data ?? [];
    if (!ownLightningAddressNormalized) {
      return values;
    }

    return values.filter(
      (suggestion) => suggestion.toLowerCase() !== ownLightningAddressNormalized,
    );
  }, [query.data, ownLightningAddressNormalized, isDestinationFocused]);

  return {
    suggestions,
    isLoadingSuggestions: query.isFetching,
  };
};
