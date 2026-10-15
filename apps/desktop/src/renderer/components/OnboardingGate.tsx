import React from "react";
import { FolderPlus, Sparkles } from "lucide-react";
import { openProjectFolder } from "../features/commands/registry.ts";

export const OnboardingGate: React.FC = () => {
  return (
    <div className="onboarding-gate">
      <div className="onboarding-gate__card">
        <div className="onboarding-gate__icon-wrap">
          <Sparkles size={32} className="onboarding-gate__icon" />
        </div>
        <h1 className="onboarding-gate__title">Welcome to Hive</h1>
        <p className="onboarding-gate__desc">
          Hive requires an open project to get started. Open a workspace folder or repository to start a session.
        </p>
        <button
          type="button"
          className="onboarding-gate__btn"
          onClick={() => void openProjectFolder()}
        >
          <FolderPlus size={16} />
          <span>Open a Project Folder</span>
        </button>
      </div>
    </div>
  );
};
