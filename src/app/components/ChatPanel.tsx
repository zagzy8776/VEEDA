import { motion, AnimatePresence } from 'motion/react';
import { X, Send, Sparkles, Plus, Camera, Image as ImageIcon, FileText, Trash2 } from 'lucide-react';
import { Fragment, useState, useRef, useEffect, type ReactNode } from 'react';
import { apiFetchDetailed, getActor, getCurrentUser, LOCAL_USER_ID } from '../api';
import { emergencyHelpLine, resolveEmergencyNumber } from '../emergencyNumber';
import { CHILD_NOT_VALIDATED_NOTE } from '../dependents';
import { INTAKE_STEPS, answerIntake, createIntakeSession, buildConsultationRecord, type IntakeSession, type ConsultationRecord } from '../symptomIntake';
import { converse, createDialogueState, dailyCheckIn, type DialogueResult, type NearbyCare } from '../dialogueEngine';
import { saveConsultation } from '../consultations';
import { ConsultationSheet } from './ConsultationSheet';
import { recognizePackageImage } from '../medicineOcr';
import { buildRegistry } from '../modelRegistry';
import { imageVisionState, fetchVisionStatus } from '../sensorContext';
import { buildVisionAnalyzePayload } from '../visionRequest';
import { formatAttachmentSize, shouldUseNativeCamera, validateChatDocument, validateChatImage } from '../chatAttachments';
import { ChatCameraCapture } from './ChatCameraCapture';
import type { Vitals, Analysis, Profile, Location } from '../useVedaApp';

// Temporary restore stub if full file push is too large — replaced below with full content marker
export { ChatPanel } from './ChatPanelFull';
