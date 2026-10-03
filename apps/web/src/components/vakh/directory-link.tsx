"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

/** Opens the public Vakh directory once the studio account has set it up; renders nothing before. */
export function VakhDirectoryLink() {
  const status = useQuery({
    queryKey: ["vakh-status-public"],
    queryFn: () => api<{ directoryUrl: string | null }>("/vakh/status"),
    staleTime: 5 * 60_000,
  });
  const url = status.data?.directoryUrl;
  if (!url) return null;
  return (
    <Button asChild className="self-start">
      <a href={url} target="_blank" rel="noopener noreferrer">
        Open the Vakh directory <ExternalLink aria-hidden />
      </a>
    </Button>
  );
}
