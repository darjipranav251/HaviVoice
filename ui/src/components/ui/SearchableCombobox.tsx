"use client";

import { Check, ChevronsUpDown, Search } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

export interface ComboboxOption {
  value: string;
  label: string;
  subLabel?: string;
  flag?: string;
  searchValue?: string;
}

interface SearchableComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  className = "",
  disabled = false,
}: SearchableComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((opt) => opt.value === value);

  const filteredOptions = options.filter((opt) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase().trim();
    const searchTarget = (
      opt.searchValue || `${opt.flag || ""} ${opt.label} ${opt.subLabel || ""} ${opt.value}`
    ).toLowerCase();
    return searchTarget.includes(query);
  });

  // Handle outside click to close popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Focus search input when popover opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery("");
    }
  }, [isOpen]);

  const handleSelect = (val: string) => {
    onChange(val);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {/* Selector Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
      >
        <span className="truncate flex items-center gap-2">
          {selectedOption ? (
            <>
              {selectedOption.flag && <span className="text-base">{selectedOption.flag}</span>}
              <span className="font-medium text-foreground">{selectedOption.label}</span>
              {selectedOption.subLabel && (
                <span className="text-xs text-muted-foreground">({selectedOption.subLabel})</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-1" />
      </button>

      {/* Searchable Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 min-w-[220px] w-full rounded-md border bg-popover text-popover-foreground shadow-lg outline-none animate-in fade-in-0 zoom-in-95">
          {/* Search Bar */}
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 shrink-0 opacity-50 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              className="flex h-7 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setIsOpen(false);
                }
              }}
            />
          </div>

          {/* Options List */}
          <div className="max-h-60 overflow-y-auto p-1 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No matching country or code found.
              </div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={`${opt.value}-${opt.label}`}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={`flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-xs sm:text-sm text-left transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer ${
                      isSelected ? "bg-accent/60 font-medium text-accent-foreground" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2 truncate pr-2">
                      {opt.flag && <span className="text-base leading-none">{opt.flag}</span>}
                      <span className="truncate">{opt.label}</span>
                      {opt.subLabel && (
                        <span className="text-xs text-muted-foreground shrink-0">{opt.subLabel}</span>
                      )}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-primary ml-auto" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
