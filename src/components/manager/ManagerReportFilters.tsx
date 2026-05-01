"use client";

import React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type MonthOption = { value: string; label: string; start: string; end: string };
type FilterOption = { value: string; label: string };

type Props = {
  months: MonthOption[];
  monthValue: string;
  onMonthChange: (v: string) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (v: string) => void;
  onEndDateChange: (v: string) => void;
  clientOptions?: FilterOption[];
  clientValue: string;
  onClientChange: (v: string) => void;
  projectOptions?: FilterOption[];
  projectValue: string;
  onProjectChange: (v: string) => void;
  avgRateInput: string;
  onAvgRateChange: (v: string) => void;
  suggestedRate: number | null;
  onApplySuggested: () => void;
  generated: boolean;
  onGenerate: () => void;
  onReset: () => void;
  onSave?: () => void;
};

const ManagerReportFilters: React.FC<Props> = ({
  months,
  monthValue,
  onMonthChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  clientOptions = [],
  clientValue,
  onClientChange,
  projectOptions = [],
  projectValue,
  onProjectChange,
  avgRateInput,
  onAvgRateChange,
  suggestedRate,
  onApplySuggested,
  generated,
  onGenerate,
  onReset,
  onSave,
}) => {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[220px]">
        <div className="text-sm text-muted-foreground">Quick month</div>
        <Select value={monthValue} onValueChange={onMonthChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Select month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="custom">Custom range</SelectItem>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-muted-foreground">Start</div>
            <Input type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">End</div>
            <Input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <div className="text-sm text-muted-foreground">Client</div>
        <Select value={clientValue} onValueChange={onClientChange}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="All clients" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All clients</SelectItem>
            {clientOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="text-sm text-muted-foreground">Project</div>
        <Select value={projectValue} onValueChange={onProjectChange}>
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder="All projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projectOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <div className="text-sm text-muted-foreground">Avg USD/DOP rate</div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            inputMode="decimal"
            value={avgRateInput}
            onChange={(e) => onAvgRateChange(e.target.value)}
            placeholder={suggestedRate != null ? `Suggested: ${suggestedRate.toFixed(6)}` : "Enter rate"}
            className="w-[220px]"
          />
          <Button variant="outline" size="sm" onClick={onApplySuggested}>Apply suggested</Button>
        </div>
      </div>

      <div className="ml-auto flex items-end gap-2">
        <Button size="sm" onClick={onGenerate}>Generate report</Button>
        {generated && (
          <>
            <Button size="sm" variant="outline" onClick={onReset}>Reset</Button>
            {onSave ? <Button size="sm" onClick={onSave}>Save report</Button> : null}
          </>
        )}
      </div>
    </div>
  );
};

export default ManagerReportFilters;
