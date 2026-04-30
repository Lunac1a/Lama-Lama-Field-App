"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type SyncStatus = "Pending" | "Synced" | "Failed";
type RecordType = "wildlife" | "environment" | "biosecurity" | "community";
type View =
  | { name: "home" }
  | { name: "module"; module: RecordType }
  | { name: "new"; module: RecordType }
  | { name: "edit"; module: RecordType; id: string }
  | { name: "manage"; module: RecordType }
  | { name: "profile" }
  | { name: "sync" };

type FieldType = "text" | "number" | "select" | "textarea";

type FieldConfig = {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
};

type BaseRecord = {
  id: string;
  recordType: RecordType;
  rangerId: string;
  createdTime: string;
  updatedTime: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  photoPath: string | null;
  notes: string;
  syncStatus: SyncStatus;
  data: Record<string, string>;
};

type RangerProfile = {
  name: string;
  rangerId: string;
  team: string;
  role: string;
  contact: string;
};

type WorkLog = {
  id: string;
  task: string;
  startTime: string;
  endTime: string;
  duration: string;
  siteName: string;
  gpsLatitude: number | null;
  gpsLongitude: number | null;
  notes: string;
  createdTime: string;
};

const storageKeys: Record<RecordType, string> = {
  wildlife: "lama_lama_wildlife_records",
  environment: "lama_lama_environment_records",
  biosecurity: "lama_lama_biosecurity_records",
  community: "lama_lama_community_records",
};

const moduleConfigs: Record<
  RecordType,
  {
    title: string;
    shortTitle: string;
    description: string;
    accent: string;
    fields: FieldConfig[];
    cardFields: string[];
  }
> = {
  wildlife: {
    title: "Wildlife Observation",
    shortTitle: "Wildlife",
    description: "Record animals or plants observed in the field.",
    accent: "leaf",
    cardFields: ["speciesName", "category", "count"],
    fields: [
      { key: "speciesName", label: "Species name", type: "text", required: true },
      { key: "category", label: "Category", type: "select", options: ["Animal", "Plant", "Other"] },
      { key: "count", label: "Count", type: "number" },
      {
        key: "condition",
        label: "Condition / Behaviour",
        type: "select",
        options: ["Normal", "Injured", "Dead", "Unusual", "Other"],
      },
    ],
  },
  environment: {
    title: "Environmental Monitoring",
    shortTitle: "Environment",
    description: "Record environmental conditions and site changes.",
    accent: "water",
    cardFields: ["monitoringType", "weather"],
    fields: [
      { key: "monitoringType", label: "Monitoring type", type: "select", options: ["Water", "Land", "Fire", "General"] },
      { key: "weather", label: "Weather", type: "select", options: ["Sunny", "Cloudy", "Rainy", "Windy", "Other"] },
      { key: "waterLevel", label: "Water level", type: "select", options: ["Low", "Normal", "High", "Flooded"] },
      { key: "waterQuality", label: "Water quality", type: "select", options: ["Clear", "Muddy", "Polluted", "Smelly", "Other"] },
      { key: "landCondition", label: "Land condition", type: "select", options: ["Dry", "Wet", "Burned", "Damaged", "Normal"] },
      { key: "fireSigns", label: "Fire signs", type: "select", options: ["None", "Recent burn", "Old burn", "Smoke", "Other"] },
    ],
  },
  biosecurity: {
    title: "Biosecurity / Invasive Species",
    shortTitle: "Biosecurity",
    description: "Report invasive species or biosecurity risks.",
    accent: "alert",
    cardFields: ["type", "name", "severity"],
    fields: [
      { key: "type", label: "Type", type: "select", options: ["Invasive animal", "Invasive plant", "Disease", "Pest", "Unknown"] },
      { key: "name", label: "Name", type: "text", required: true },
      { key: "severity", label: "Severity", type: "select", options: ["Low", "Medium", "High"] },
      { key: "spreadLevel", label: "Spread level", type: "select", options: ["Single spot", "Multiple spots", "Wide area"] },
      { key: "actionTaken", label: "Action taken", type: "select", options: ["None", "Photo", "Marked", "Removed", "Reported"] },
    ],
  },
  community: {
    title: "Community Issue Report",
    shortTitle: "Community",
    description: "Report infrastructure, safety, or community problems.",
    accent: "community",
    cardFields: ["issueType", "severity", "shortDescription"],
    fields: [
      { key: "issueType", label: "Issue type", type: "select", options: ["Road damage", "Broken equipment", "Safety risk", "Pollution", "Waste", "Other"] },
      { key: "severity", label: "Severity", type: "select", options: ["Low", "Medium", "High", "Urgent"] },
      { key: "shortDescription", label: "Short description", type: "text", required: true },
    ],
  },
};

const profileKey = "lama_lama_ranger_profile";
const workLogKey = "lama_lama_work_logs";
const networkKey = "lama_lama_network_status";
const gpsKey = "lama_lama_gps_status";
const lastSyncKey = "lama_lama_last_sync_time";

const defaultProfile: RangerProfile = {
  name: "",
  rangerId: "LLR-001",
  team: "",
  role: "",
  contact: "",
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function shortTime(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getMockGps(available: boolean) {
  if (!available) return { gpsLatitude: null, gpsLongitude: null };
  const lat = -14.46 + Math.random() * 0.16;
  const lng = 143.31 + Math.random() * 0.18;
  return {
    gpsLatitude: Number(lat.toFixed(5)),
    gpsLongitude: Number(lng.toFixed(5)),
  };
}

function gpsLabel(record: Pick<BaseRecord, "gpsLatitude" | "gpsLongitude">) {
  if (record.gpsLatitude === null || record.gpsLongitude === null) return "GPS not available";
  return `${record.gpsLatitude.toFixed(3)}, ${record.gpsLongitude.toFixed(3)}`;
}

function emptyForm(module: RecordType) {
  return moduleConfigs[module].fields.reduce<Record<string, string>>((values, field) => {
    values[field.key] = field.options?.[0] ?? "";
    return values;
  }, {});
}

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>({ name: "home" });
  const [records, setRecords] = useState<Record<RecordType, BaseRecord[]>>({
    wildlife: [],
    environment: [],
    biosecurity: [],
    community: [],
  });
  const [profile, setProfile] = useState<RangerProfile>(defaultProfile);
  const [workLogs, setWorkLogs] = useState<WorkLog[]>([]);
  const [networkOnline, setNetworkOnline] = useState(true);
  const [gpsAvailable, setGpsAvailable] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState("");
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncMessage, setSyncMessage] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRecords({
        wildlife: readJson<BaseRecord[]>(storageKeys.wildlife, []),
        environment: readJson<BaseRecord[]>(storageKeys.environment, []),
        biosecurity: readJson<BaseRecord[]>(storageKeys.biosecurity, []),
        community: readJson<BaseRecord[]>(storageKeys.community, []),
      });
      setProfile(readJson<RangerProfile>(profileKey, defaultProfile));
      setWorkLogs(readJson<WorkLog[]>(workLogKey, []));
      setNetworkOnline(readJson<boolean>(networkKey, true));
      setGpsAvailable(readJson<boolean>(gpsKey, true));
      setLastSyncTime(readJson<string>(lastSyncKey, ""));
      setHydrated(true);
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  const allRecords = useMemo(() => Object.values(records).flat(), [records]);
  const pendingCount = allRecords.filter((record) => record.syncStatus === "Pending").length;
  const failedCount = allRecords.filter((record) => record.syncStatus === "Failed").length;
  const syncedCount = allRecords.filter((record) => record.syncStatus === "Synced").length;

  function persistRecords(next: Record<RecordType, BaseRecord[]>) {
    setRecords(next);
    Object.entries(next).forEach(([type, list]) => writeJson(storageKeys[type as RecordType], list));
  }

  function updateModule(module: RecordType, updater: (current: BaseRecord[]) => BaseRecord[]) {
    const next = { ...records, [module]: updater(records[module]) };
    persistRecords(next);
  }

  function setNetwork(value: boolean) {
    setNetworkOnline(value);
    writeJson(networkKey, value);
  }

  function setGps(value: boolean) {
    setGpsAvailable(value);
    writeJson(gpsKey, value);
  }

  function saveProfile(next: RangerProfile) {
    setProfile(next);
    writeJson(profileKey, next);
  }

  function saveWorkLogs(next: WorkLog[]) {
    setWorkLogs(next);
    writeJson(workLogKey, next);
  }

  function syncRecords(targetStatus: SyncStatus) {
    if (!networkOnline) {
      setSyncMessage("No internet. Data is safely stored on this device.");
      return;
    }

    const candidates = allRecords.filter((record) => record.syncStatus === targetStatus);
    if (!candidates.length) {
      setSyncMessage(targetStatus === "Failed" ? "No failed records to retry." : "No pending records to sync.");
      return;
    }

    setSyncMessage("Uploading local records...");
    setSyncProgress(20);

    window.setTimeout(() => setSyncProgress(60), 350);
    window.setTimeout(() => {
      const next = { ...records };
      (Object.keys(next) as RecordType[]).forEach((module) => {
        next[module] = next[module].map((record) =>
          record.syncStatus === targetStatus ? { ...record, syncStatus: "Synced", updatedTime: nowIso() } : record,
        );
      });
      const stamp = nowIso();
      persistRecords(next);
      setLastSyncTime(stamp);
      writeJson(lastSyncKey, stamp);
      setSyncProgress(100);
      setSyncMessage("Sync complete. Local records are marked as synced.");
    }, 900);
  }

  if (!hydrated) {
    return <main className="loading-screen">Loading Lama Lama Field Data App...</main>;
  }

  return (
    <main className="app-shell">
      <StatusBar
        networkOnline={networkOnline}
        gpsAvailable={gpsAvailable}
        pendingCount={pendingCount}
        onNetworkChange={setNetwork}
        onGpsChange={setGps}
      />
      {view.name === "home" && (
        <HomePage
          records={records}
          pendingCount={pendingCount}
          syncedCount={syncedCount}
          failedCount={failedCount}
          networkOnline={networkOnline}
          gpsAvailable={gpsAvailable}
          onNavigate={setView}
        />
      )}
      {view.name === "module" && (
        <ModulePage module={view.module} records={records[view.module]} onNavigate={setView} />
      )}
      {view.name === "new" && (
        <RecordForm
          module={view.module}
          profile={profile}
          gpsAvailable={gpsAvailable}
          onCancel={() => setView({ name: "module", module: view.module })}
          onSave={(record) => {
            updateModule(view.module, (current) => [record, ...current]);
            setView({ name: "module", module: view.module });
          }}
        />
      )}
      {view.name === "edit" && (
        <RecordForm
          module={view.module}
          profile={profile}
          gpsAvailable={gpsAvailable}
          existing={records[view.module].find((record) => record.id === view.id)}
          onCancel={() => setView({ name: "module", module: view.module })}
          onDelete={(id) => {
            updateModule(view.module, (current) => current.filter((record) => record.id !== id));
            setView({ name: "module", module: view.module });
          }}
          onSave={(record) => {
            updateModule(view.module, (current) =>
              current.map((item) => (item.id === record.id ? record : item)),
            );
            setView({ name: "module", module: view.module });
          }}
        />
      )}
      {view.name === "manage" && (
        <ManageRecords
          module={view.module}
          records={records[view.module]}
          onCancel={() => setView({ name: "module", module: view.module })}
          onDelete={(ids) => {
            updateModule(view.module, (current) => current.filter((record) => !ids.includes(record.id)));
            setView({ name: "module", module: view.module });
          }}
        />
      )}
      {view.name === "profile" && (
        <ProfilePage
          profile={profile}
          workLogs={workLogs}
          records={records}
          pendingCount={pendingCount}
          syncedCount={syncedCount}
          gpsAvailable={gpsAvailable}
          onProfileSave={saveProfile}
          onWorkLogsSave={saveWorkLogs}
          onNavigate={setView}
        />
      )}
      {view.name === "sync" && (
        <SyncPage
          networkOnline={networkOnline}
          pendingCount={pendingCount}
          failedCount={failedCount}
          lastSyncTime={lastSyncTime}
          syncProgress={syncProgress}
          syncMessage={syncMessage}
          onSync={() => syncRecords("Pending")}
          onRetry={() => syncRecords("Failed")}
          onNavigate={setView}
        />
      )}
    </main>
  );
}

function StatusBar({
  networkOnline,
  gpsAvailable,
  pendingCount,
  onNetworkChange,
  onGpsChange,
}: {
  networkOnline: boolean;
  gpsAvailable: boolean;
  pendingCount: number;
  onNetworkChange: (value: boolean) => void;
  onGpsChange: (value: boolean) => void;
}) {
  return (
    <header className="status-bar">
      <div>
        <p className="eyebrow">Lama Lama Field Data App</p>
        <h1>Offline field records</h1>
      </div>
      <div className="status-actions">
        <ToggleButton active={networkOnline} onClick={() => onNetworkChange(!networkOnline)} activeText="Online" inactiveText="Offline" />
        <ToggleButton active={gpsAvailable} onClick={() => onGpsChange(!gpsAvailable)} activeText="GPS Available" inactiveText="GPS Not Available" />
        <span className={`badge ${pendingCount ? "pending" : "synced"}`}>{pendingCount ? "Pending records" : "Synced"}</span>
      </div>
    </header>
  );
}

function ToggleButton({
  active,
  activeText,
  inactiveText,
  onClick,
}: {
  active: boolean;
  activeText: string;
  inactiveText: string;
  onClick: () => void;
}) {
  return (
    <button className={`toggle ${active ? "active" : ""}`} onClick={onClick} type="button">
      <span />
      {active ? activeText : inactiveText}
    </button>
  );
}

function HomePage({
  records,
  pendingCount,
  syncedCount,
  failedCount,
  networkOnline,
  gpsAvailable,
  onNavigate,
}: {
  records: Record<RecordType, BaseRecord[]>;
  pendingCount: number;
  syncedCount: number;
  failedCount: number;
  networkOnline: boolean;
  gpsAvailable: boolean;
  onNavigate: (view: View) => void;
}) {
  const total = Object.values(records).flat().length;

  return (
    <section className="page-grid">
      <div className="hero-panel">
        <p className="eyebrow">Field-ready local storage</p>
        <h2>Lama Lama Field Data App</h2>
        <p>
          Capture ranger observations offline, keep records on this device, and sync when the network is available.
        </p>
        <div className="hero-status">
          <StatusPill label="Network" value={networkOnline ? "Online" : "Offline"} tone={networkOnline ? "good" : "warn"} />
          <StatusPill label="GPS" value={gpsAvailable ? "Available" : "Not available"} tone={gpsAvailable ? "good" : "warn"} />
          <StatusPill label="Sync" value={pendingCount ? "Pending records" : "Synced"} tone={pendingCount ? "pending" : "good"} />
        </div>
      </div>

      <div className="summary-grid">
        <SummaryCard label="All local records" value={total} />
        <SummaryCard label="Pending uploads" value={pendingCount} />
        <SummaryCard label="Synced records" value={syncedCount} />
        <SummaryCard label="Failed records" value={failedCount} />
      </div>

      <div className="nav-grid">
        {(Object.keys(moduleConfigs) as RecordType[]).map((module) => (
          <button
            className={`nav-card ${moduleConfigs[module].accent}`}
            key={module}
            onClick={() => onNavigate({ name: "module", module })}
            type="button"
          >
            <span>{moduleConfigs[module].shortTitle}</span>
            <strong>{moduleConfigs[module].title}</strong>
            <small>{records[module].length} saved records</small>
          </button>
        ))}
        <button className="nav-card profile" onClick={() => onNavigate({ name: "profile" })} type="button">
          <span>Ranger</span>
          <strong>Ranger Profile & Work Log</strong>
          <small>Daily work tracking</small>
        </button>
        <button className="nav-card sync" onClick={() => onNavigate({ name: "sync" })} type="button">
          <span>Sync</span>
          <strong>Sync Page</strong>
          <small>{pendingCount} records waiting</small>
        </button>
      </div>
    </section>
  );
}

function ModulePage({ module, records, onNavigate }: { module: RecordType; records: BaseRecord[]; onNavigate: (view: View) => void }) {
  const config = moduleConfigs[module];

  return (
    <section className="content-page">
      <PageHeader
        eyebrow="Data collection module"
        title={config.title}
        description={config.description}
        actions={
          <>
            <button className="primary" onClick={() => onNavigate({ name: "new", module })} type="button">New</button>
            <button className="secondary" onClick={() => onNavigate({ name: "manage", module })} type="button">Manage</button>
            <button className="secondary" onClick={() => onNavigate({ name: "home" })} type="button">Back to Home</button>
          </>
        }
      />

      <div className="record-list">
        {records.length === 0 ? (
          <div className="empty-state">
            <h3>No records yet</h3>
            <p>Create a local record. It will stay on this device and wait for sync.</p>
          </div>
        ) : (
          records.map((record) => (
            <RecordCard key={record.id} module={module} record={record} onClick={() => onNavigate({ name: "edit", module, id: record.id })} />
          ))
        )}
      </div>
    </section>
  );
}

function RecordCard({ module, record, onClick }: { module: RecordType; record: BaseRecord; onClick: () => void }) {
  const config = moduleConfigs[module];
  const title = record.data[config.cardFields[0]] || config.title;

  return (
    <button className="record-card" onClick={onClick} type="button">
      <div>
        <h3>{title}</h3>
        <p>{config.cardFields.slice(1).map((field) => record.data[field]).filter(Boolean).join(" / ") || "Field record"}</p>
      </div>
      <div className="record-meta">
        <span>{shortTime(record.createdTime)}</span>
        <span>{gpsLabel(record)}</span>
        <span className={`badge ${record.syncStatus.toLowerCase()}`}>{record.syncStatus}</span>
      </div>
    </button>
  );
}

function RecordForm({
  module,
  profile,
  gpsAvailable,
  existing,
  onSave,
  onCancel,
  onDelete,
}: {
  module: RecordType;
  profile: RangerProfile;
  gpsAvailable: boolean;
  existing?: BaseRecord;
  onSave: (record: BaseRecord) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}) {
  const config = moduleConfigs[module];
  const [values, setValues] = useState<Record<string, string>>(existing?.data ?? emptyForm(module));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [photoName, setPhotoName] = useState(existing?.photoPath ?? "");
  const gps = existing ?? getMockGps(gpsAvailable);

  function submit(event: FormEvent) {
    event.preventDefault();
    const timestamp = nowIso();
    const record: BaseRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      recordType: module,
      rangerId: profile.rangerId || "LLR-001",
      createdTime: existing?.createdTime ?? timestamp,
      updatedTime: timestamp,
      gpsLatitude: gps.gpsLatitude,
      gpsLongitude: gps.gpsLongitude,
      photoPath: photoName || null,
      notes,
      syncStatus: "Pending",
      data: values,
    };
    onSave(record);
  }

  return (
    <section className="content-page">
      <PageHeader
        eyebrow={existing ? "Edit local record" : "New local record"}
        title={existing ? `Edit ${config.shortTitle} Record` : `New ${config.shortTitle} Record`}
        description="Records are saved in this browser and marked Pending until sync."
      />
      <form className="field-form" onSubmit={submit}>
        <div className="form-grid">
          {config.fields.map((field) => (
            <label className="field" key={field.key}>
              <span>{field.label}</span>
              {field.type === "select" ? (
                <select value={values[field.key] ?? ""} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}>
                  {field.options?.map((option) => <option key={option}>{option}</option>)}
                </select>
              ) : (
                <input
                  required={field.required}
                  type={field.type}
                  value={values[field.key] ?? ""}
                  onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
                />
              )}
            </label>
          ))}
          <label className="field">
            <span>Date and time</span>
            <input readOnly value={shortTime(existing?.createdTime ?? nowIso())} />
          </label>
          <label className="field">
            <span>GPS location</span>
            <input readOnly value={gpsLabel(gps)} />
          </label>
          <label className="field">
            <span>Photo</span>
            <input type="file" onChange={(event) => setPhotoName(event.target.files?.[0]?.name ?? "")} />
          </label>
          <label className="field wide">
            <span>Notes</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} />
          </label>
        </div>
        {photoName && <p className="photo-note">Photo placeholder: {photoName}</p>}
        <div className="button-row">
          <button className="primary" type="submit">Save</button>
          {existing && onDelete && <button className="danger" onClick={() => onDelete(existing.id)} type="button">Delete</button>}
          <button className="secondary" onClick={onCancel} type="button">Cancel</button>
        </div>
      </form>
    </section>
  );
}

function ManageRecords({
  module,
  records,
  onDelete,
  onCancel,
}: {
  module: RecordType;
  records: BaseRecord[];
  onDelete: (ids: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const config = moduleConfigs[module];

  return (
    <section className="content-page">
      <PageHeader eyebrow="Manage records" title={`Manage ${config.shortTitle}`} description="Select local records for batch deletion." />
      <div className="manage-list">
        {records.map((record) => (
          <label className="manage-row" key={record.id}>
            <input
              checked={selected.includes(record.id)}
              type="checkbox"
              onChange={(event) =>
                setSelected(event.target.checked ? [...selected, record.id] : selected.filter((id) => id !== record.id))
              }
            />
            <span>{record.data[config.cardFields[0]] || config.title}</span>
            <small>{shortTime(record.createdTime)}</small>
          </label>
        ))}
        {!records.length && <div className="empty-state"><h3>No records to manage</h3></div>}
      </div>
      <div className="button-row">
        <button className="danger" disabled={!selected.length} onClick={() => onDelete(selected)} type="button">Delete Selected</button>
        <button className="secondary" onClick={onCancel} type="button">Cancel</button>
      </div>
    </section>
  );
}

function ProfilePage({
  profile,
  workLogs,
  records,
  pendingCount,
  syncedCount,
  gpsAvailable,
  onProfileSave,
  onWorkLogsSave,
  onNavigate,
}: {
  profile: RangerProfile;
  workLogs: WorkLog[];
  records: Record<RecordType, BaseRecord[]>;
  pendingCount: number;
  syncedCount: number;
  gpsAvailable: boolean;
  onProfileSave: (profile: RangerProfile) => void;
  onWorkLogsSave: (logs: WorkLog[]) => void;
  onNavigate: (view: View) => void;
}) {
  const [localProfile, setLocalProfile] = useState(profile);
  const [task, setTask] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [siteName, setSiteName] = useState("");
  const [notes, setNotes] = useState("");

  const duration = useMemo(() => {
    if (!startTime || !endTime) return "";
    const minutes = Math.max(0, Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000));
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours}h ${rest}m`;
  }, [startTime, endTime]);

  function saveLog() {
    const gps = getMockGps(gpsAvailable);
    const next: WorkLog = {
      id: crypto.randomUUID(),
      task,
      startTime,
      endTime,
      duration,
      siteName,
      notes,
      ...gps,
      createdTime: nowIso(),
    };
    onWorkLogsSave([next, ...workLogs]);
  }

  return (
    <section className="content-page two-column">
      <PageHeader
        eyebrow="Ranger profile"
        title="Ranger Profile & Work Log"
        description="Track ranger details, daily work, and local record totals."
        actions={<button className="secondary" onClick={() => onNavigate({ name: "home" })} type="button">Back to Home</button>}
      />
      <form className="panel" onSubmit={(event) => { event.preventDefault(); onProfileSave(localProfile); }}>
        <h3>Profile</h3>
        {(["name", "rangerId", "team", "role", "contact"] as (keyof RangerProfile)[]).map((key) => (
          <label className="field" key={key}>
            <span>{key === "rangerId" ? "Ranger ID" : key[0].toUpperCase() + key.slice(1)}</span>
            <input value={localProfile[key]} onChange={(event) => setLocalProfile({ ...localProfile, [key]: event.target.value })} />
          </label>
        ))}
        <button className="primary" type="submit">Save Profile</button>
      </form>
      <div className="panel">
        <h3>Work Log</h3>
        <label className="field"><span>Today&apos;s task</span><input value={task} onChange={(event) => setTask(event.target.value)} /></label>
        <label className="field"><span>Site name</span><input value={siteName} onChange={(event) => setSiteName(event.target.value)} /></label>
        <div className="button-row compact">
          <button className="secondary" onClick={() => setStartTime(nowIso())} type="button">Start Work</button>
          <button className="secondary" onClick={() => setEndTime(nowIso())} type="button">End Work</button>
        </div>
        <div className="time-grid">
          <span>Start: {shortTime(startTime)}</span>
          <span>End: {shortTime(endTime)}</span>
          <span>Duration: {duration || "Not calculated"}</span>
        </div>
        <label className="field"><span>Notes</span><textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="button-row compact">
          <button className="primary" onClick={saveLog} type="button">Save Log</button>
          <button className="secondary" onClick={() => onNavigate({ name: "home" })} type="button">View Records</button>
        </div>
      </div>
      <div className="panel full-width">
        <h3>Data Summary</h3>
        <div className="summary-grid">
          <SummaryCard label="Wildlife records" value={records.wildlife.length} />
          <SummaryCard label="Environmental records" value={records.environment.length} />
          <SummaryCard label="Biosecurity records" value={records.biosecurity.length} />
          <SummaryCard label="Community issue records" value={records.community.length} />
          <SummaryCard label="Pending uploads" value={pendingCount} />
          <SummaryCard label="Synced records" value={syncedCount} />
        </div>
      </div>
    </section>
  );
}

function SyncPage({
  networkOnline,
  pendingCount,
  failedCount,
  lastSyncTime,
  syncProgress,
  syncMessage,
  onSync,
  onRetry,
  onNavigate,
}: {
  networkOnline: boolean;
  pendingCount: number;
  failedCount: number;
  lastSyncTime: string;
  syncProgress: number;
  syncMessage: string;
  onSync: () => void;
  onRetry: () => void;
  onNavigate: (view: View) => void;
}) {
  return (
    <section className="content-page">
      <PageHeader
        eyebrow="Offline-first sync"
        title="Sync Page"
        description="Simulate upload behavior while keeping records safely stored in this browser."
        actions={<button className="secondary" onClick={() => onNavigate({ name: "home" })} type="button">Back to Home</button>}
      />
      <div className="sync-panel">
        <StatusPill label="Network status" value={networkOnline ? "Online" : "Offline"} tone={networkOnline ? "good" : "warn"} />
        <StatusPill label="Pending records" value={String(pendingCount)} tone={pendingCount ? "pending" : "good"} />
        <StatusPill label="Failed records" value={String(failedCount)} tone={failedCount ? "bad" : "good"} />
        <StatusPill label="Last sync time" value={lastSyncTime ? shortTime(lastSyncTime) : "Never"} tone="neutral" />
        <div className="progress-track"><span style={{ width: `${syncProgress}%` }} /></div>
        <p className="sync-message">{!networkOnline ? "No internet. Data is safely stored on this device." : syncMessage || "Ready to sync local records."}</p>
        <div className="button-row">
          <button className="primary" onClick={onSync} type="button">Sync Now</button>
          <button className="secondary" onClick={onRetry} type="button">Retry Failed</button>
          <button className="secondary" onClick={() => onNavigate({ name: "home" })} type="button">Back to Home</button>
        </div>
      </div>
    </section>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions && <div className="button-row">{actions}</div>}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StatusPill({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "pending" | "bad" | "neutral" }) {
  return (
    <div className={`status-pill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
