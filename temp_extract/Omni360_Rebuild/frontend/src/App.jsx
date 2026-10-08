// ============================================================
// OMNI360 - COMMUNITY DIGITAL ASSISTANT
// Complete Student + Faculty + Admin frontend.
// This version keeps the existing functionality and adds safer
// validation, role routing, loading handling and multi-user support.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import "./App.css";

// Store the FastAPI server address in one place.
const API_BASE_URL = "http://127.0.0.1:8000";

// Safely convert a backend response into JSON when possible.
const readResponse = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text };
  }
};

// Send requests to FastAPI without breaking multipart file uploads.
const apiRequest = async (path, options = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, options);
    const data = await readResponse(response);
    return { response, data };
  } catch (error) {
    return {
      response: null,
      data: { message: "Unable to connect to the Omni360 server." },
      networkError: error,
    };
  }
};

// Convert any status text into a CSS-friendly class name.
const statusClass = (status) =>
  String(status || "unknown").toLowerCase().replace(/\s+/g, "-");

// Convert a backend file path into a browser URL.
const fileUrl = (path) => {
  if (!path) return "";
  const value = String(path);
  return value.startsWith("http")
    ? value
    : `${API_BASE_URL}/${value.replace(/^\//, "")}`;
};

// Keep timetable days in a predictable order and safely group records.
const groupTimetableByDay = (records = []) => {
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const grouped = {};
  days.forEach((day) => (grouped[day] = []));

  records.forEach((record) => {
    const rawDay = String(record.day || "").trim();
    const day = rawDay
      ? rawDay.charAt(0).toUpperCase() + rawDay.slice(1).toLowerCase()
      : "Other";
    if (!grouped[day]) grouped[day] = [];
    grouped[day].push(record);
  });

  Object.values(grouped).forEach((classes) => {
    classes.sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")));
  });

  return grouped;
};

// Reusable feature card used by Student and Faculty dashboards.
function FeatureCard({ icon, title, text, onClick }) {
  // FeatureCard is intentionally presentational.
  // Admin-only data must stay inside the main App component.
  // Keeping this card stateless prevents runtime crashes when dashboards render.
  return (
    <div className="student-feature-card">
      <div className="feature-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button type="button" onClick={onClick}>Open →</button>
    </div>
  );
}

// Reusable certificate display for Student and Faculty views.
function CertificateCard({ certificate }) {
  const url = fileUrl(certificate.file_path);
  return (
    <div className="data-card">
      <h3>{certificate.title || certificate.certificate_type || "Certificate"}</h3>
      <p><strong>Type:</strong> {certificate.certificate_type || "N/A"}</p>
      {certificate.description && <p>{certificate.description}</p>}
      {certificate.certificate_date && <p><strong>Date:</strong> {certificate.certificate_date}</p>}
      <p><strong>Uploaded by:</strong> {certificate.uploaded_by_role || "N/A"}</p>
      {certificate.issued_by && <p><strong>Issued by:</strong> {certificate.issued_by}</p>}
      {url && (
        <div className="button-row">
          <a href={url} target="_blank" rel="noreferrer"><button type="button">View</button></a>
          <a href={url} download><button type="button">Download</button></a>
        </div>
      )}
    </div>
  );
}

function ProfilePhotoEditor({ editor, onClose, onSave }) {
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [saving, setSaving] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  // Create one temporary browser URL and clean it up when the file changes.
  useEffect(() => {
    if (!editor?.file) {
      setPreviewUrl("");
      return undefined;
    }

    const objectUrl = URL.createObjectURL(editor.file);
    setPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [editor?.file]);

  if (!editor?.file || !previewUrl) return null;

  const createCroppedFile = async () => {
    setSaving(true);

    try {
      const image = new Image();
      image.src = previewUrl;

      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });

      const size = 700;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");

      if (!ctx) throw new Error("Unable to prepare the photo editor.");

      const scale = Math.max(
        size / image.naturalWidth,
        size / image.naturalHeight
      ) * zoom;

      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const x = (size - drawWidth) / 2 + offsetX * 2.2;
      const y = (size - drawHeight) / 2 + offsetY * 2.2;

      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(image, x, y, drawWidth, drawHeight);

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.92);
      });

      if (!blob) throw new Error("Unable to create the adjusted image.");

      const fileName = `${editor.role.toLowerCase()}_profile_${Date.now()}.jpg`;
      const croppedFile = new File([blob], fileName, { type: "image/jpeg" });
      const saved = await onSave(editor.role, editor.userId, croppedFile);

      if (saved !== false) onClose();
    } catch (error) {
      console.error("Profile photo editor error:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="profile-modal-overlay" style={{ zIndex: 1000 }}>
      <div className="profile-modal" style={{ maxWidth: "620px", width: "94vw" }}>
        <button type="button" onClick={onClose} style={{ float: "right" }}>×</button>
        <h2>📷 Adjust Profile Photo</h2>
        <p>Move and zoom the photo before saving it.</p>

        <div
          style={{
            width: "min(420px, 82vw)",
            height: "min(420px, 82vw)",
            margin: "20px auto",
            overflow: "hidden",
            borderRadius: "24px",
            border: "3px solid rgba(99,102,241,.2)",
            background: "#111827",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <img
            src={previewUrl}
            alt="Crop preview"
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`
            }}
          />
        </div>

        <div className="form-group">
          <label>Zoom</label>
          <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label>Horizontal adjustment</label>
          <input type="range" min="-100" max="100" value={offsetX} onChange={(e) => setOffsetX(Number(e.target.value))} />
        </div>
        <div className="form-group">
          <label>Vertical adjustment</label>
          <input type="range" min="-100" max="100" value={offsetY} onChange={(e) => setOffsetY(Number(e.target.value))} />
        </div>

        <div className="button-row">
          <button type="button" onClick={() => { setZoom(1); setOffsetX(0); setOffsetY(0); }}>↺ Reset</button>
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" disabled={saving} onClick={createCroppedFile}>{saving ? "Saving..." : "Save Photo"}</button>
        </div>
      </div>
    </div>
  );
}
function App() {
  // Store whether the navigation menu is open.
  const [menuOpen, setMenuOpen] = useState(false);

  // Store the authentication screen and current authentication mode.
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [loginRole, setLoginRole] = useState("");


  // Store authentication form values.
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authNewPassword, setAuthNewPassword] = useState("");
  const [authConfirmPassword, setAuthConfirmPassword] = useState("");
  const [resetToken, setResetToken] = useState("");

  // Store the currently logged-in user for each role.
  const [studentData, setStudentData] = useState(null);

  // Store the read-only Omni360 AI Assistant state.
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [facultyData, setFacultyData] = useState(null);
  const [adminData, setAdminData] = useState(null);
  const [studentDashboardOpen, setStudentDashboardOpen] = useState(false);
  const [facultyDashboardOpen, setFacultyDashboardOpen] = useState(false);
  const [adminDashboardOpen, setAdminDashboardOpen] = useState(false);

  // Store the live Admin dashboard summary from the Omni360 database.
  const [adminSummary, setAdminSummary] = useState({
    total_students: 0,
    total_faculty: 0,
    total_applications: 0,
    pending_applications: 0,
    total_complaints: 0,
    open_complaints: 0,
    total_gate_passes: 0,
    pending_gate_passes: 0,
    total_certificates: 0,
    students_with_pending_fees: 0,
    hostel_residents: 0,
    total_notices: 0,
  });
  const [adminSummaryLoading, setAdminSummaryLoading] = useState(false);
  const [adminSummaryError, setAdminSummaryError] = useState("");

  // Store the currently open Admin module.
  const [adminSection, setAdminSection] = useState("overview");

  // Store Admin User Management data.
  const [adminStudents, setAdminStudents] = useState([]);
  const [adminFaculty, setAdminFaculty] = useState([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState(false);
  const [adminUsersError, setAdminUsersError] = useState("");
  const [adminUserSearch, setAdminUserSearch] = useState("");
  const [adminUserTab, setAdminUserTab] = useState("students");

  // Store the Add Student form.
  const [adminStudentFormOpen, setAdminStudentFormOpen] = useState(false);
  const [adminStudentName, setAdminStudentName] = useState("");
  const [adminStudentRoll, setAdminStudentRoll] = useState("");
  const [adminStudentCourse, setAdminStudentCourse] = useState("");
  const [adminStudentSemester, setAdminStudentSemester] = useState("");
  const [adminStudentEmail, setAdminStudentEmail] = useState("");
  const [adminStudentPassword, setAdminStudentPassword] = useState("");
  const [adminStudentDepartment, setAdminStudentDepartment] = useState("");
  const [adminStudentDepartmentDrafts, setAdminStudentDepartmentDrafts] = useState({});
  const [adminStudentDepartmentSavingId, setAdminStudentDepartmentSavingId] = useState(null);
  const [adminStudentSubmitting, setAdminStudentSubmitting] = useState(false);

  // Store the Add Faculty form.
  const [adminFacultyFormOpen, setAdminFacultyFormOpen] = useState(false);
  const [adminFacultyName, setAdminFacultyName] = useState("");
  const [adminFacultyEmployeeId, setAdminFacultyEmployeeId] = useState("");
  const [adminFacultyDepartment, setAdminFacultyDepartment] = useState("");
  const [adminFacultyDesignation, setAdminFacultyDesignation] = useState("");
  const [adminFacultyEmail, setAdminFacultyEmail] = useState("");
  const [adminFacultyPassword, setAdminFacultyPassword] = useState("");
  const [adminFacultySubmitting, setAdminFacultySubmitting] = useState(false);
  const [adminFacultyHostelRole, setAdminFacultyHostelRole] = useState("Faculty");
  const [adminFacultyHostelRoleSavingId, setAdminFacultyHostelRoleSavingId] = useState(null);
  const [adminFacultyHostelRoleDrafts, setAdminFacultyHostelRoleDrafts] = useState({});

  // Store Admin Complaint Management data.
  const [adminComplaints, setAdminComplaints] = useState([]);
  const [adminComplaintsLoading, setAdminComplaintsLoading] = useState(false);
  const [adminComplaintsError, setAdminComplaintsError] = useState("");
  const [adminComplaintsMessage, setAdminComplaintsMessage] = useState("");
  const [adminComplaintStatusDrafts, setAdminComplaintStatusDrafts] = useState({});
  const [adminComplaintDepartmentDrafts, setAdminComplaintDepartmentDrafts] = useState({});
  const [adminComplaintUpdatingId, setAdminComplaintUpdatingId] = useState(null);

  const [adminFacultyComplaints, setAdminFacultyComplaints] = useState([]);
  const [adminFacultyComplaintsLoading, setAdminFacultyComplaintsLoading] = useState(false);
  const [adminFacultyComplaintsError, setAdminFacultyComplaintsError] = useState("");
  const [adminFacultyComplaintStatusDrafts, setAdminFacultyComplaintStatusDrafts] = useState({});
  const [adminFacultyComplaintResponseDrafts, setAdminFacultyComplaintResponseDrafts] = useState({});
  const [adminFacultyComplaintUpdatingId, setAdminFacultyComplaintUpdatingId] = useState(null);

  // Store Admin Application Management data.
  const [adminApplications, setAdminApplications] = useState([]);
  const [adminApplicationsLoading, setAdminApplicationsLoading] = useState(false);
  const [adminApplicationsError, setAdminApplicationsError] = useState("");
  const [adminApplicationsMessage, setAdminApplicationsMessage] = useState("");
  const [adminApplicationProcessingId, setAdminApplicationProcessingId] = useState(null);

  // Store Admin Gate Pass Management data.
  const [adminGatePasses, setAdminGatePasses] = useState([]);
  const [adminGatePassesLoading, setAdminGatePassesLoading] = useState(false);
  const [adminGatePassesError, setAdminGatePassesError] = useState("");
  const [adminGatePassesMessage, setAdminGatePassesMessage] = useState("");
  const [adminGatePassProcessingId, setAdminGatePassProcessingId] = useState(null);

  // Store Admin Certificate Management data.
  const [adminCertificates, setAdminCertificates] = useState([]);
  const [adminCertificatesLoading, setAdminCertificatesLoading] = useState(false);
  const [adminCertificatesError, setAdminCertificatesError] = useState("");
  const [adminCertificatesMessage, setAdminCertificatesMessage] = useState("");
  const [adminCertificateFormOpen, setAdminCertificateFormOpen] = useState(false);
  const [adminCertificateDepartment, setAdminCertificateDepartment] = useState("");
  const [adminCertificateSemester, setAdminCertificateSemester] = useState("");
  const [adminCertificateStudentId, setAdminCertificateStudentId] = useState("");
  const [adminCertificateType, setAdminCertificateType] = useState("Bonafide Certificate");
  const [adminCertificateTitle, setAdminCertificateTitle] = useState("");
  const [adminCertificateDate, setAdminCertificateDate] = useState("");
  const [adminCertificateFile, setAdminCertificateFile] = useState(null);
  const [adminCertificateSubmitting, setAdminCertificateSubmitting] = useState(false);

  // Store Admin Fee Management data.
  const [adminFees, setAdminFees] = useState([]);
  const [adminFeesLoading, setAdminFeesLoading] = useState(false);
  const [adminFeesError, setAdminFeesError] = useState("");
  const [adminFeesMessage, setAdminFeesMessage] = useState("");
  const [adminFeeFormOpen, setAdminFeeFormOpen] = useState(false);
  const [adminFeeStudentId, setAdminFeeStudentId] = useState("");
  const [adminFeeSemester, setAdminFeeSemester] = useState("");
  const [adminFeeType, setAdminFeeType] = useState("Semester Fee");
  const [adminFeeTotal, setAdminFeeTotal] = useState("");
  const [adminFeePaid, setAdminFeePaid] = useState("");
  const [adminFeeDueDate, setAdminFeeDueDate] = useState("");
  const [adminFeeSubmitting, setAdminFeeSubmitting] = useState(false);
  const [adminFeePaidDrafts, setAdminFeePaidDrafts] = useState({});
  const [adminFeeUpdatingId, setAdminFeeUpdatingId] = useState(null);
  const [adminFeeTransferTargetDrafts, setAdminFeeTransferTargetDrafts] = useState({});
  const [adminFeeTransferAmountDrafts, setAdminFeeTransferAmountDrafts] = useState({});
  const [adminFeeTransferProcessingId, setAdminFeeTransferProcessingId] = useState(null);

  // Store Admin Notice Management data.
  const [adminNotices, setAdminNotices] = useState([]);
  const [adminNoticesLoading, setAdminNoticesLoading] = useState(false);
  const [adminNoticesError, setAdminNoticesError] = useState("");
  const [adminNoticesMessage, setAdminNoticesMessage] = useState("");
  const [adminNoticeFormOpen, setAdminNoticeFormOpen] = useState(false);
  const [adminNoticeTitle, setAdminNoticeTitle] = useState("");
  const [adminNoticeContent, setAdminNoticeContent] = useState("");
  const [adminNoticeTargetType, setAdminNoticeTargetType] = useState("All");
  const [adminNoticeTargetValue, setAdminNoticeTargetValue] = useState("");
  const [adminNoticeSubmitting, setAdminNoticeSubmitting] = useState(false);
  const [adminNoticeDeletingId, setAdminNoticeDeletingId] = useState(null);

  // Store Admin Reports / Analytics data.
  const [adminReports, setAdminReports] = useState(null);
  const [adminReportsLoading, setAdminReportsLoading] = useState(false);
  const [adminReportsError, setAdminReportsError] = useState("");

  // Store Faculty's own applications (separate from applications Faculty reviews).
  const [facultyMyApplications, setFacultyMyApplications] = useState([]);
  const [facultyMyApplicationsLoading, setFacultyMyApplicationsLoading] = useState(false);
  const [facultyMyApplicationsError, setFacultyMyApplicationsError] = useState("");
  const [facultyApplicationFormOpen, setFacultyApplicationFormOpen] = useState(false);
  const [facultyApplicationType, setFacultyApplicationType] = useState("Leave");
  const [facultyApplicationTitle, setFacultyApplicationTitle] = useState("");
  const [facultyApplicationDescription, setFacultyApplicationDescription] = useState("");
  const [facultyApplicationStartDate, setFacultyApplicationStartDate] = useState("");
  const [facultyApplicationEndDate, setFacultyApplicationEndDate] = useState("");
  const [facultyApplicationSubmitting, setFacultyApplicationSubmitting] = useState(false);
  const [facultyApplicationMessage, setFacultyApplicationMessage] = useState("");

  // Complaint photos for Student / Faculty grievances.
  const [issuePhoto, setIssuePhoto] = useState(null);
  const [facultyComplaintPhoto, setFacultyComplaintPhoto] = useState(null);

  // Track which profile photo is being uploaded and show a clear result.
  const [profilePhotoUploading, setProfilePhotoUploading] = useState("");
  const [profilePhotoMessage, setProfilePhotoMessage] = useState("");
  const [profilePhotoError, setProfilePhotoError] = useState("");
  const [profilePhotoEditor, setProfilePhotoEditor] = useState(null);

  // Store Student academic data.
  const [attendanceData, setAttendanceData] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const [attendanceOpen, setAttendanceOpen] = useState(false);

  const [timetableData, setTimetableData] = useState([]);
  const [timetableLoading, setTimetableLoading] = useState(false);
  const [timetableError, setTimetableError] = useState("");
  const [timetableOpen, setTimetableOpen] = useState(false);

  const [assignmentData, setAssignmentData] = useState([]);
  const [assignmentLoading, setAssignmentLoading] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentOpen, setAssignmentOpen] = useState(false);

  // Student assignment submission state.
  const [studentAssignmentSubmitId, setStudentAssignmentSubmitId] = useState(null);
  const [studentAssignmentComment, setStudentAssignmentComment] = useState("");
  const [studentAssignmentFile, setStudentAssignmentFile] = useState(null);
  const [studentAssignmentSubmitting, setStudentAssignmentSubmitting] = useState(false);

  const [noticeData, setNoticeData] = useState([]);
  const [noticeLoading, setNoticeLoading] = useState(false);
  const [noticeError, setNoticeError] = useState("");
  const [noticeOpen, setNoticeOpen] = useState(false);

  // Store Student application form and results.
  const [applicationData, setApplicationData] = useState([]);
  const [applicationLoading, setApplicationLoading] = useState(false);
  const [applicationError, setApplicationError] = useState("");
  const [applicationOpen, setApplicationOpen] = useState(false);
  const [applicationFormOpen, setApplicationFormOpen] = useState(false);
  const [applicationType, setApplicationType] = useState("Leave");
  const [applicationTitle, setApplicationTitle] = useState("");
  const [applicationDescription, setApplicationDescription] = useState("");
  const [applicationStartDate, setApplicationStartDate] = useState("");
  const [applicationEndDate, setApplicationEndDate] = useState("");
  const [applicationSubmitting, setApplicationSubmitting] = useState(false);
  const [applicationMessage, setApplicationMessage] = useState("");

  // Store Student campus issue form and results.
  const [campusIssueData, setCampusIssueData] = useState([]);
  const [campusIssueLoading, setCampusIssueLoading] = useState(false);
  const [campusIssueError, setCampusIssueError] = useState("");
  const [campusIssueOpen, setCampusIssueOpen] = useState(false);
  const [campusIssueFormOpen, setCampusIssueFormOpen] = useState(false);
  const [issueCategory, setIssueCategory] = useState("Cleanliness");
  const [issueDescription, setIssueDescription] = useState("");
  const [issueLocation, setIssueLocation] = useState("");
  const [issueSubmitting, setIssueSubmitting] = useState(false);
  const [issueMessage, setIssueMessage] = useState("");

  // Store Student certificates.
  const [certificateData, setCertificateData] = useState([]);
  const [certificateLoading, setCertificateLoading] = useState(false);
  const [certificateError, setCertificateError] = useState("");
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [certificateFormOpen, setCertificateFormOpen] = useState(false);
  const [certificateType, setCertificateType] = useState("Bonafide Certificate");
  const [certificateTitle, setCertificateTitle] = useState("");
  const [certificateDescription, setCertificateDescription] = useState("");
  const [certificateDate, setCertificateDate] = useState("");
  const [certificateFile, setCertificateFile] = useState(null);
  const [certificateSubmitting, setCertificateSubmitting] = useState(false);
  const [certificateMessage, setCertificateMessage] = useState("");

  // Store Student fees.
  const [feeData, setFeeData] = useState([]);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeError, setFeeError] = useState("");
  const [feeOpen, setFeeOpen] = useState(false);

  // Store Student hostel and gate-pass information.
  const [gatePassData, setGatePassData] = useState([]);
  const [gatePassLoading, setGatePassLoading] = useState(false);
  const [gatePassError, setGatePassError] = useState("");
  const [hostelOpen, setHostelOpen] = useState(false);
  const [studentActiveModule, setStudentActiveModule] = useState("");
  const [gatePassFormOpen, setGatePassFormOpen] = useState(false);
  const [gatePassReason, setGatePassReason] = useState("");
  const [gatePassDestination, setGatePassDestination] = useState("");
  const [gatePassDepartureDate, setGatePassDepartureDate] = useState("");
  const [gatePassDepartureTime, setGatePassDepartureTime] = useState("");
  const [gatePassReturnDate, setGatePassReturnDate] = useState("");
  const [gatePassReturnTime, setGatePassReturnTime] = useState("");
  const [gatePassSubmitting, setGatePassSubmitting] = useState(false);
  const [gatePassMessage, setGatePassMessage] = useState("");

  // Store Faculty dashboard state.
  const [facultySection, setFacultySection] = useState("home");
  const [facultyLoading, setFacultyLoading] = useState(false);
  const [facultyError, setFacultyError] = useState("");
  const [facultyMessage, setFacultyMessage] = useState("");

  // Store the Faculty student directory and selected student.
  const [facultyStudents, setFacultyStudents] = useState([]);
  const [facultyStudentsLoading, setFacultyStudentsLoading] = useState(false);
  const [facultyStudentsError, setFacultyStudentsError] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedSemester, setSelectedSemester] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentProfileOpen, setStudentProfileOpen] = useState(false);
  const [selectedStudentAcademic, setSelectedStudentAcademic] = useState(null);
  const [facultyStudentCertificates, setFacultyStudentCertificates] = useState([]);
  const [facultyStudentCertificatesLoading, setFacultyStudentCertificatesLoading] = useState(false);
  const [facultyStudentCertificatesError, setFacultyStudentCertificatesError] = useState("");

  // Store Faculty attendance form and records.
  const [facultyAttendance, setFacultyAttendance] = useState([]);
  const [facultyAttendanceLoading, setFacultyAttendanceLoading] = useState(false);
  const [facultyAttendanceError, setFacultyAttendanceError] = useState("");
  const [attendanceStudentId, setAttendanceStudentId] = useState("");
  const [attendanceSubject, setAttendanceSubject] = useState("");
  const [attendanceAttended, setAttendanceAttended] = useState("");
  const [attendanceTotal, setAttendanceTotal] = useState("");
  const [attendanceSubmitting, setAttendanceSubmitting] = useState(false);

  // Store Faculty timetable form and records.
  const [facultyTimetable, setFacultyTimetable] = useState([]);
  const [facultyTimetableLoading, setFacultyTimetableLoading] = useState(false);
  const [facultyTimetableError, setFacultyTimetableError] = useState("");
  const [timetableCourse, setTimetableCourse] = useState("");
  const [timetableSemester, setTimetableSemester] = useState("");
  const [timetableDay, setTimetableDay] = useState("Monday");
  const [timetableSubject, setTimetableSubject] = useState("");
  const [timetableStartTime, setTimetableStartTime] = useState("");
  const [timetableEndTime, setTimetableEndTime] = useState("");
  const [timetableRoom, setTimetableRoom] = useState("");
  const [timetableSubmitting, setTimetableSubmitting] = useState(false);

  // Store Faculty assignments.
  const [facultyAssignments, setFacultyAssignments] = useState([]);
  const [facultyAssignmentsLoading, setFacultyAssignmentsLoading] = useState(false);
  const [facultyAssignmentsError, setFacultyAssignmentsError] = useState("");
  const [facultyAssignmentCourse, setFacultyAssignmentCourse] = useState("");
  const [facultyAssignmentSemester, setFacultyAssignmentSemester] = useState("");
  const [facultyAssignmentSubject, setFacultyAssignmentSubject] = useState("");
  const [facultyAssignmentTitle, setFacultyAssignmentTitle] = useState("");
  const [facultyAssignmentDescription, setFacultyAssignmentDescription] = useState("");
  const [facultyAssignmentDueDate, setFacultyAssignmentDueDate] = useState("");
  const [facultyAssignmentSubmitting, setFacultyAssignmentSubmitting] = useState(false);
  const [facultyAssignmentReviewDrafts, setFacultyAssignmentReviewDrafts] = useState({});
  const [facultyAssignmentReviewingId, setFacultyAssignmentReviewingId] = useState(null);

  // Store Faculty application and gate-pass queues.
  const [facultyApplications, setFacultyApplications] = useState([]);
  const [facultyApplicationsLoading, setFacultyApplicationsLoading] = useState(false);
  const [facultyApplicationsError, setFacultyApplicationsError] = useState("");
  const [facultyGatePasses, setFacultyGatePasses] = useState([]);
  const [facultyGatePassesLoading, setFacultyGatePassesLoading] = useState(false);
  const [facultyGatePassesError, setFacultyGatePassesError] = useState("");
  const [processingApplicationId, setProcessingApplicationId] = useState(null);
  const [processingGatePassId, setProcessingGatePassId] = useState(null);

  // Store Faculty notice form.
  const [facultyNoticeTitle, setFacultyNoticeTitle] = useState("");
  const [facultyNoticeContent, setFacultyNoticeContent] = useState("");
  const [facultyNoticeTargetType, setFacultyNoticeTargetType] = useState("All");
  const [facultyNoticeTargetValue, setFacultyNoticeTargetValue] = useState("");
  const [facultyNoticeSubmitting, setFacultyNoticeSubmitting] = useState(false);

  // Store Faculty certificate form.
  const [facultyCertificateStudentId, setFacultyCertificateStudentId] = useState("");
  const [facultyCertificateDepartment, setFacultyCertificateDepartment] = useState("");
  const [facultyCertificateSemester, setFacultyCertificateSemester] = useState("");
  const [facultyCertificateType, setFacultyCertificateType] = useState("Bonafide Certificate");
  const [facultyCertificateTitle, setFacultyCertificateTitle] = useState("");
  const [facultyCertificateDate, setFacultyCertificateDate] = useState("");
  const [facultyCertificateFile, setFacultyCertificateFile] = useState(null);
  const [facultyCertificateSubmitting, setFacultyCertificateSubmitting] = useState(false);

  // Store Faculty complaints and student complaints visible to Faculty.
  const [facultyComplaints, setFacultyComplaints] = useState([]);
  const [facultyComplaintsLoading, setFacultyComplaintsLoading] = useState(false);
  const [facultyComplaintsError, setFacultyComplaintsError] = useState("");
  const [facultyComplaintFormOpen, setFacultyComplaintFormOpen] = useState(false);
  const [facultyComplaintCategory, setFacultyComplaintCategory] = useState("Academic");
  const [facultyComplaintTitle, setFacultyComplaintTitle] = useState("");
  const [facultyComplaintDescription, setFacultyComplaintDescription] = useState("");
  const [facultyComplaintAuthority, setFacultyComplaintAuthority] = useState("Admin");
  const [facultyComplaintSubmitting, setFacultyComplaintSubmitting] = useState(false);
  const [facultyComplaintMessage, setFacultyComplaintMessage] = useState("");
  const [studentComplaints, setStudentComplaints] = useState([]);
  const [studentComplaintsLoading, setStudentComplaintsLoading] = useState(false);
  const [studentComplaintsError, setStudentComplaintsError] = useState("");

  // Store Faculty pending actions.
  const [pendingActions, setPendingActions] = useState([]);
  const [pendingActionsLoading, setPendingActionsLoading] = useState(false);
  const [pendingActionsError, setPendingActionsError] = useState("");

  // Shared card styling keeps the existing visual structure.
  const facultyCardStyle = {
    padding: "22px",
    marginBottom: "20px",
    borderRadius: "18px",
    background: "rgba(255,255,255,.88)",
    border: "1px solid rgba(99,102,241,.14)",
    boxShadow: "0 15px 45px rgba(15,23,42,.08)",
  };

  // Open the authentication popup in a selected mode.
  const openAuth = (mode = "login") => {
    setAuthMode(mode === "login" ? "role-select" : mode);
    if (mode === "login") setLoginRole("");
    setAuthOpen(true);
    setAuthError("");
    setAuthMessage("");
    setAuthLoading(false);
  };

  // Close authentication and clear transient messages.
  const closeAuth = () => {
    setAuthOpen(false);
    setAuthError("");
    setAuthMessage("");
    setAuthLoading(false);
    setLoginRole("");
  };

  // Activate a registered account using the backend endpoint.
  const handleActivateAccount = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");

    if (authNewPassword.length < 8) {
      setAuthError("Password must contain at least 8 characters.");
      return;
    }
    if (authNewPassword !== authConfirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }

    setAuthLoading(true);
    const { response, data } = await apiRequest("/auth/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authEmail.trim(), password: authNewPassword }),
    });

    if (response?.ok && data.success !== false) {
      setAuthMessage(data.message || "Account activated. Please login.");
      setAuthMode("role-select");
      setLoginRole("");
      setAuthPassword("");
      setAuthNewPassword("");
      setAuthConfirmPassword("");
    } else {
      setAuthError(data.message || "Unable to activate account.");
    }
    setAuthLoading(false);
  };

  // Open the correct dashboard after a successful role-based login.
  const openDashboardFromLogin = (data) => {
    const explicitRole = String(data.role || data.user?.role || "").toLowerCase();
    const user = data.user || data.student || data.faculty || data.admin || null;
    const role = explicitRole || (data.faculty ? "faculty" : data.admin ? "admin" : "student");

    // Close every dashboard before opening the authenticated role.
    setStudentDashboardOpen(false);
    setFacultyDashboardOpen(false);
    setAdminDashboardOpen(false);

    if (role === "faculty" || role === "teacher") {
      setFacultyData(user);
      setFacultyDashboardOpen(true);
      setFacultySection("home");
      return;
    }

    if (role === "admin" || role === "administrator") {
      setAdminData(user);
      setAdminDashboardOpen(true);
      // Load live campus totals immediately after Admin login.
      loadAdminDashboardSummary();
      return;
    }

    setStudentData(user);
    setStudentDashboardOpen(true);
  };

  // Try unified authentication first and then the role-specific endpoints.
  const handleUnifiedLogin = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");

    if (!authEmail.trim() || !authPassword) {
      setAuthError("Please enter your email and password.");
      return;
    }

    setAuthLoading(true);
    const payload = { email: authEmail.trim(), password: authPassword };

    // The unified backend endpoint now handles Student, Faculty and Admin.
    // Keeping one endpoint prevents unnecessary fallback requests.
    const endpoints = ["/auth/login"];
    let successData = null;
    let lastMessage = "Invalid email or password.";

    for (const endpoint of endpoints) {
      const { response, data } = await apiRequest(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response?.ok && data.success !== false) {
        successData = data;
        break;
      }
      if (data?.message) lastMessage = data.message;
    }

    if (successData) {
      if (loginRole && String(successData.role || "").toLowerCase() !== loginRole.toLowerCase()) {
        setAuthError(`This email belongs to the ${successData.role} role. Please go back and choose ${successData.role}.`);
        setAuthLoading(false);
        return;
      }

      openDashboardFromLogin(successData);
      closeAuth();
      setAuthEmail("");
      setAuthPassword("");
      setLoginRole("");
    } else {
      setAuthError(lastMessage);
    }
    setAuthLoading(false);
  };

  // Request a password-reset token from the backend.
  const handleForgotPassword = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");
    setAuthLoading(true);

    const { response, data } = await apiRequest("/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: authEmail.trim() }),
    });

    if (response?.ok) {
      setResetToken(data.reset_token || "");
      setAuthMessage(data.message || "If the account exists, reset instructions were generated.");
      if (data.reset_token) setAuthMode("reset");
    } else {
      setAuthError(data.message || "Unable to process password reset.");
    }
    setAuthLoading(false);
  };

  // Submit the new password to the backend.
  const handleResetPassword = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthMessage("");

    if (authNewPassword.length < 8) {
      setAuthError("Password must contain at least 8 characters.");
      return;
    }
    if (authNewPassword !== authConfirmPassword) {
      setAuthError("Passwords do not match.");
      return;
    }
    if (!resetToken.trim()) {
      setAuthError("Reset token is required.");
      return;
    }

    setAuthLoading(true);
    const { response, data } = await apiRequest("/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: resetToken.trim(), email: authEmail.trim(), password: authNewPassword }),
    });

    if (response?.ok && data.success !== false) {
      setAuthMessage(data.message || "Password reset successful. Please login.");
      setAuthMode("role-select");
      setLoginRole("");
      setAuthNewPassword("");
      setAuthConfirmPassword("");
      setResetToken("");
    } else {
      setAuthError(data.message || "Unable to reset password.");
    }
    setAuthLoading(false);
  };

  // Keep Student modules on one dashboard panel at a time.
  const closeStudentPanels = () => {
    setAttendanceOpen(false);
    setTimetableOpen(false);
    setAssignmentOpen(false);
    setNoticeOpen(false);
    setApplicationOpen(false);
    setCampusIssueOpen(false);
    setCertificateOpen(false);
    setFeeOpen(false);
    setHostelOpen(false);
    setAiOpen(false);
  };

  // Load Student attendance.
  const handleViewAttendance = async () => {
    if (!studentData?.id) return;
    closeStudentPanels(); setStudentActiveModule("attendance"); setAttendanceOpen(true);
    setAttendanceLoading(true);
    setAttendanceError("");
    const { response, data } = await apiRequest(`/students/${studentData.id}/attendance`);
    if (response?.ok) setAttendanceData(Array.isArray(data.attendance) ? data.attendance : []);
    else setAttendanceError(data.message || "Unable to load attendance.");
    setAttendanceLoading(false);
  };

  // Load Student timetable.
  const handleViewTimetable = async () => {
    if (!studentData?.id) return;
    closeStudentPanels(); setStudentActiveModule("timetable"); setTimetableOpen(true);
    setTimetableLoading(true);
    setTimetableError("");
    const { response, data } = await apiRequest(`/students/${studentData.id}/timetable`);
    if (response?.ok) setTimetableData(Array.isArray(data.timetable) ? data.timetable : []);
    else setTimetableError(data.message || "Unable to load timetable.");
    setTimetableLoading(false);
  };

  // Load Student assignments.
  const handleViewAssignments = async () => {
    if (!studentData?.id) return;
    closeStudentPanels(); setStudentActiveModule("assignments"); setAssignmentOpen(true);
    setAssignmentLoading(true);
    setAssignmentError("");
    const { response, data } = await apiRequest(`/students/${studentData.id}/assignments`);
    if (response?.ok) setAssignmentData(Array.isArray(data.assignments) ? data.assignments : []);
    else setAssignmentError(data.message || "Unable to load assignments.");
    setAssignmentLoading(false);
  };

  // Submit completed work from the logged-in Student to Faculty.
  const handleStudentAssignmentSubmit = async (event) => {
    event.preventDefault();
    if (!studentData?.id || !studentAssignmentSubmitId) return;

    const assignment = assignmentData.find((item) => Number(item.id) === Number(studentAssignmentSubmitId));
    if (!assignment) {
      setAssignmentError("Assignment was not found.");
      return;
    }

    const status = String(assignment.status || "Pending");
    if (status === "Completed") {
      setAssignmentError("This assignment has already been marked Completed by Faculty.");
      return;
    }

    if (!studentAssignmentComment.trim() && !studentAssignmentFile) {
      setAssignmentError("Upload your completed work or add a submission note.");
      return;
    }

    setStudentAssignmentSubmitting(true);
    setAssignmentError("");

    const formData = new FormData();
    formData.append("comment", studentAssignmentComment.trim());
    if (studentAssignmentFile) formData.append("file", studentAssignmentFile);

    const { response, data } = await apiRequest(
      `/students/${studentData.id}/assignments/${assignment.id}/submit`,
      { method: "POST", body: formData }
    );

    if (response?.ok && data.success !== false) {
      setStudentAssignmentSubmitId(null);
      setStudentAssignmentComment("");
      setStudentAssignmentFile(null);

      const refreshed = await apiRequest(`/students/${studentData.id}/assignments`);
      if (refreshed.response?.ok) {
        setAssignmentData(Array.isArray(refreshed.data.assignments) ? refreshed.data.assignments : []);
      }
    } else {
      setAssignmentError(data.message || "Unable to submit the assignment.");
    }

    setStudentAssignmentSubmitting(false);
  };

  // Load targeted campus notices.
  const handleViewNotices = async () => {
    if (!studentData?.id) return;
    closeStudentPanels(); setStudentActiveModule("notices"); setNoticeOpen(true);
    setNoticeLoading(true);
    setNoticeError("");
    const { response, data } = await apiRequest(`/students/${studentData.id}/notices`);
    if (response?.ok) setNoticeData(Array.isArray(data.notices) ? data.notices : []);
    else setNoticeError(data.message || "Unable to load notices.");
    setNoticeLoading(false);
  };

  // Load Student applications.
  const handleViewApplications = async () => {
    if (!studentData?.id) return;
    closeStudentPanels(); setStudentActiveModule("applications"); setApplicationOpen(true);
    setApplicationLoading(true);
    setApplicationError("");
    const { response, data } = await apiRequest(`/students/${studentData.id}/applications`);
    if (response?.ok) setApplicationData(Array.isArray(data.applications) ? data.applications : []);
    else setApplicationError(data.message || "Unable to load applications.");
    setApplicationLoading(false);
  };

  // Submit a Student application after checking the dates.
  const handleSubmitApplication = async (event) => {
    event.preventDefault();
    setApplicationError("");
    setApplicationMessage("");
    if (!studentData?.id) return;
    if (!applicationTitle.trim() || !applicationDescription.trim()) {
      setApplicationError("Title and description are required.");
      return;
    }
    if (applicationStartDate && applicationEndDate && applicationEndDate < applicationStartDate) {
      setApplicationError("End date cannot be before start date.");
      return;
    }

    setApplicationSubmitting(true);
    const { response, data } = await apiRequest("/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicant_id: studentData.id,
        applicant_role: "Student",
        application_type: applicationType,
        title: applicationTitle.trim(),
        description: applicationDescription.trim(),
        start_date: applicationStartDate || null,
        end_date: applicationEndDate || null,
      }),
    });

    if (response?.ok && data.success !== false) {
      setApplicationTitle("");
      setApplicationDescription("");
      setApplicationStartDate("");
      setApplicationEndDate("");
      setApplicationFormOpen(false);
      setApplicationMessage(data.message || "Application submitted successfully.");
      await handleViewApplications();
    } else {
      setApplicationError(data.message || "Unable to submit application.");
    }
    setApplicationSubmitting(false);
  };

  // Load Student campus issues.
  const handleViewCampusIssues = async () => {
    if (!studentData?.id) return;
    closeStudentPanels(); setStudentActiveModule("issues"); setCampusIssueOpen(true);
    setCampusIssueLoading(true);
    setCampusIssueError("");
    const { response, data } = await apiRequest(`/students/${studentData.id}/campus-issues`);
    if (response?.ok) setCampusIssueData(Array.isArray(data.issues) ? data.issues : []);
    else setCampusIssueError(data.message || "Unable to load campus issues.");
    setCampusIssueLoading(false);
  };

  // Submit a Student campus complaint.
  const handleSubmitCampusIssue = async (event) => {
    event.preventDefault();
    setCampusIssueError("");
    setIssueMessage("");
    if (!studentData?.id) return;
    if (!issueDescription.trim() || !issueLocation.trim()) {
      setCampusIssueError("Description and location are required.");
      return;
    }

    setIssueSubmitting(true);

    let photoPath = null;
    if (issuePhoto) {
      const photoForm = new FormData();
      photoForm.append("student_id", String(studentData.id));
      photoForm.append("file", issuePhoto);
      const photoResult = await apiRequest("/campus-issues/upload-photo", {
        method: "POST",
        body: photoForm,
      });

      if (!photoResult.response?.ok) {
        setCampusIssueError(photoResult.data.message || "Unable to upload complaint photo.");
        setIssueSubmitting(false);
        return;
      }
      photoPath = photoResult.data.file_path || null;
    }

    const { response, data } = await apiRequest("/campus-issues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentData.id,
        category: issueCategory,
        description: issueDescription.trim(),
        location: issueLocation.trim(),
        photo_path: photoPath,
      }),
    });

    if (response?.ok && data.success !== false) {
      setIssueDescription("");
      setIssueLocation("");
      setIssuePhoto(null);
      setCampusIssueFormOpen(false);
      setIssueMessage(data.message || "Campus issue reported successfully.");
      await handleViewCampusIssues();
    } else {
      setCampusIssueError(data.message || "Unable to report campus issue.");
    }
    setIssueSubmitting(false);
  };

  // Load Student certificates.
  const handleViewCertificates = async () => {
    if (!studentData?.id) return;
    closeStudentPanels(); setStudentActiveModule("certificates"); setCertificateOpen(true);
    setCertificateLoading(true);
    setCertificateError("");
    const { response, data } = await apiRequest(`/students/${studentData.id}/certificates`);
    if (response?.ok) setCertificateData(Array.isArray(data.certificates) ? data.certificates : []);
    else setCertificateError(data.message || "Unable to load certificates.");
    setCertificateLoading(false);
  };

  // Upload a certificate file without manually setting multipart Content-Type.
  // Upload a profile photo for the currently logged-in Student, Faculty or Admin.
  const handleProfilePhotoUpload = async (role, userId, file) => {
    if (!file || !userId) return false;

    setProfilePhotoMessage("");
    setProfilePhotoError("");

    const key = `${role}-${userId}`;
    setProfilePhotoUploading(key);

    const formData = new FormData();
    formData.append("role", role);
    formData.append("user_id", String(userId));
    formData.append("file", file);

    const { response, data } = await apiRequest("/profile-photo", {
      method: "POST",
      body: formData,
    });

    if (response?.ok && data.success !== false) {
      const photo = data.file_url || data.profile_photo;
      if (role === "Student") {
        setStudentData((current) => current ? { ...current, profile_photo: photo } : current);
      } else if (role === "Faculty") {
        setFacultyData((current) => current ? { ...current, profile_photo: photo } : current);
      } else {
        setAdminData((current) => current ? { ...current, profile_photo: photo } : current);
      }
      setProfilePhotoMessage("Profile photo updated successfully.");
    } else {
      setProfilePhotoError(data.message || "Unable to update profile photo.");
    }

    setProfilePhotoUploading("");
    return Boolean(response?.ok && data.success !== false);
  };

  // Delete the currently saved profile photo.
  const handleProfilePhotoDelete = async (role, userId) => {
    if (!userId) return;
    setProfilePhotoMessage("");
    setProfilePhotoError("");
    const query = new URLSearchParams({ role, user_id: String(userId) });
    const { response, data } = await apiRequest(`/profile-photo?${query.toString()}`, { method: "DELETE" });
    if (response?.ok && data.success !== false) {
      if (role === "Student") setStudentData((current) => current ? { ...current, profile_photo: null } : current);
      else if (role === "Faculty") setFacultyData((current) => current ? { ...current, profile_photo: null } : current);
      else setAdminData((current) => current ? { ...current, profile_photo: null } : current);
      setProfilePhotoMessage("Profile photo removed successfully.");
    } else {
      setProfilePhotoError(data.message || "Unable to remove profile photo.");
    }
  };

  const uploadCertificateFile = async (file, studentId, role, uploaderId) => {
    if (!file) return { success: true, filePath: null };
    const formData = new FormData();
    formData.append("file", file);
    formData.append("student_id", String(studentId));
    formData.append("uploaded_by_role", role);
    formData.append("uploaded_by_id", String(uploaderId));
    const { response, data } = await apiRequest("/certificates/upload", {
      method: "POST",
      body: formData,
    });
    return {
      success: Boolean(response?.ok && data.success !== false),
      filePath: data.file_path || data.path || null,
      message: data.message,
    };
  };

  // Save a Student certificate and optional proof file.
  const handleSubmitCertificate = async (event) => {
    event.preventDefault();
    setCertificateError("");
    setCertificateMessage("");
    if (!studentData?.id) return;
    if (!certificateTitle.trim()) {
      setCertificateError("Certificate title is required.");
      return;
    }

    setCertificateSubmitting(true);
    let filePath = null;
    if (certificateFile) {
      const upload = await uploadCertificateFile(certificateFile, studentData.id, "Student", studentData.id);
      if (!upload.success) {
        setCertificateError(upload.message || "Unable to upload certificate file.");
        setCertificateSubmitting(false);
        return;
      }
      filePath = upload.filePath;
    }

    const { response, data } = await apiRequest("/certificates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentData.id,
        title: certificateTitle.trim(),
        certificate_type: certificateType,
        description: certificateDescription.trim(),
        file_path: filePath,
        uploaded_by_role: "Student",
        uploaded_by_id: studentData.id,
        issued_by: null,
        certificate_date: certificateDate || null,
      }),
    });

    if (response?.ok && data.success !== false) {
      setCertificateTitle("");
      setCertificateDescription("");
      setCertificateDate("");
      setCertificateFile(null);
      setCertificateFormOpen(false);
      setCertificateMessage(data.message || "Certificate added successfully.");
      await handleViewCertificates();
    } else {
      setCertificateError(data.message || "Unable to save certificate.");
    }
    setCertificateSubmitting(false);
  };

  // Load Student fees.
  const handleViewFees = async () => {
    if (!studentData?.id) return;
    closeStudentPanels(); setStudentActiveModule("fees"); setFeeOpen(true);
    setFeeLoading(true);
    setFeeError("");
    const { response, data } = await apiRequest(`/students/${studentData.id}/fees`);
    if (response?.ok) setFeeData(Array.isArray(data.fees) ? data.fees : []);
    else setFeeError(data.message || "Unable to load fees.");
    setFeeLoading(false);
  };

  // Load Student gate passes.
  const handleViewHostel = async () => {
    if (!studentData?.id) return;
    closeStudentPanels(); setStudentActiveModule("hostel"); setHostelOpen(true);
    setGatePassLoading(true);
    setGatePassError("");
    const { response, data } = await apiRequest(`/students/${studentData.id}/gate-passes`);
    if (response?.ok) setGatePassData(Array.isArray(data.gate_passes) ? data.gate_passes : []);
    else setGatePassError(data.message || "Unable to load gate passes.");
    setGatePassLoading(false);
  };

  // Submit a gate pass and ensure return time is not before departure.
  const handleSubmitGatePass = async (event) => {
    event.preventDefault();
    setGatePassError("");
    setGatePassMessage("");
    if (!studentData?.id) return;
    const departure = `${gatePassDepartureDate}T${gatePassDepartureTime}`;
    const returning = `${gatePassReturnDate}T${gatePassReturnTime}`;
    if (returning <= departure) {
      setGatePassError("Return date and time must be after departure date and time.");
      return;
    }

    setGatePassSubmitting(true);
    const { response, data } = await apiRequest("/hostel/gate-passes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentData.id,
        reason: gatePassReason.trim(),
        destination: gatePassDestination.trim(),
        departure_date: gatePassDepartureDate,
        departure_time: gatePassDepartureTime,
        return_date: gatePassReturnDate,
        return_time: gatePassReturnTime,
      }),
    });

    if (response?.ok && data.success !== false) {
      setGatePassReason("");
      setGatePassDestination("");
      setGatePassDepartureDate("");
      setGatePassDepartureTime("");
      setGatePassReturnDate("");
      setGatePassReturnTime("");
      setGatePassFormOpen(false);
      setGatePassMessage(data.message || "Gate pass submitted successfully.");
      await handleViewHostel();
    } else {
      setGatePassError(data.message || "Unable to submit gate pass.");
    }
    setGatePassSubmitting(false);
  };

  // Load the selected Faculty section from the appropriate backend endpoint.
  const openFacultySection = async (section) => {
    // A Student Profile belongs only to the Student Directory view.
    // Close/clear it before opening another Faculty module so it cannot appear randomly.
    setStudentProfileOpen(false);
    setSelectedStudent(null);
    setSelectedStudentAcademic(null);

    if (section !== "certificates") {
      setFacultyCertificateStudentId("");
      setFacultyCertificateDepartment("");
      setFacultyCertificateSemester("");
      setFacultyStudentCertificates([]);
      setFacultyStudentCertificatesError("");
    }

    setFacultySection(section);
    setFacultyError("");
    setFacultyMessage("");
    if (!facultyData?.id || section === "home" || section === "notices" || section === "certificates") {
      if (section === "certificates" && facultyData?.id) {
        setFacultyStudentsLoading(true);
        const { response, data } = await apiRequest(`/faculty/${facultyData.id}/students`);
        if (response?.ok) setFacultyStudents(Array.isArray(data.students) ? data.students : []);
        else setFacultyStudentsError(data.message || "Unable to load students.");
        setFacultyStudentsLoading(false);
      }
      return;
    }

    const id = facultyData.id;
    try {
      if (section === "profile") {
        setFacultyLoading(true);
        const { response, data } = await apiRequest(`/faculty/${id}`);
        if (response?.ok && data.faculty) setFacultyData(data.faculty);
        else if (!response?.ok) setFacultyError(data.message || "Unable to load faculty profile.");
      }

      if (section === "students" || section === "attendance") {
        setFacultyStudentsLoading(true);
        const { response, data } = await apiRequest(`/faculty/${id}/students`);
        if (response?.ok) setFacultyStudents(Array.isArray(data.students) ? data.students : []);
        else setFacultyStudentsError(data.message || "Unable to load students.");
        setFacultyStudentsLoading(false);
      }

      if (section === "attendance") {
        setFacultyAttendanceLoading(true);
        const { response, data } = await apiRequest(`/faculty/${id}/attendance`);
        if (response?.ok) setFacultyAttendance(Array.isArray(data.attendance) ? data.attendance : []);
        else setFacultyAttendanceError(data.message || "Unable to load attendance.");
        setFacultyAttendanceLoading(false);
      }

      if (section === "timetable") {
        setFacultyTimetableLoading(true);
        const { response, data } = await apiRequest(`/faculty/${id}/timetable`);
        if (response?.ok) setFacultyTimetable(Array.isArray(data.timetable) ? data.timetable : []);
        else setFacultyTimetableError(data.message || "Unable to load timetable.");
        setFacultyTimetableLoading(false);
      }

      if (section === "assignments") {
        setFacultyAssignmentsLoading(true);
        const { response, data } = await apiRequest(`/faculty/${id}/assignments`);
        if (response?.ok) setFacultyAssignments(Array.isArray(data.assignments) ? data.assignments : []);
        else setFacultyAssignmentsError(data.message || "Unable to load assignments.");
        setFacultyAssignmentsLoading(false);
      }

      if (section === "applications") {
        setFacultyApplicationsLoading(true);
        setFacultyMyApplicationsLoading(true);
        const [reviewResult, mineResult] = await Promise.all([
          apiRequest(`/faculty/${id}/applications`),
          apiRequest(`/faculty/${id}/my-applications`),
        ]);

        if (reviewResult.response?.ok) setFacultyApplications(Array.isArray(reviewResult.data.applications) ? reviewResult.data.applications : []);
        else setFacultyApplicationsError(reviewResult.data.message || "Unable to load student applications.");

        if (mineResult.response?.ok) setFacultyMyApplications(Array.isArray(mineResult.data.applications) ? mineResult.data.applications : []);
        else setFacultyMyApplicationsError(mineResult.data.message || "Unable to load your applications.");

        setFacultyApplicationsLoading(false);
        setFacultyMyApplicationsLoading(false);
      }

      if (section === "gatepasses") {
        setFacultyGatePassesLoading(true);
        const { response, data } = await apiRequest(`/faculty/${id}/gate-passes`);
        if (response?.ok) setFacultyGatePasses(Array.isArray(data.gate_passes) ? data.gate_passes : []);
        else setFacultyGatePassesError(data.message || "Unable to load gate passes.");
        setFacultyGatePassesLoading(false);
      }

      if (section === "complaints") {
        setFacultyComplaintsLoading(true);
        setStudentComplaintsLoading(true);
        const [own, student] = await Promise.all([
          apiRequest(`/faculty/${id}/complaints`),
          apiRequest(`/faculty/${id}/student-complaints`),
        ]);
        if (own.response?.ok) setFacultyComplaints(Array.isArray(own.data.complaints) ? own.data.complaints : []);
        else setFacultyComplaintsError(own.data.message || "Unable to load faculty complaints.");
        if (student.response?.ok) setStudentComplaints(Array.isArray(student.data.complaints) ? student.data.complaints : []);
        else setStudentComplaintsError(student.data.message || "Unable to load student complaints.");
        setFacultyComplaintsLoading(false);
        setStudentComplaintsLoading(false);
      }

      if (section === "pending") {
        setPendingActionsLoading(true);
        const { response, data } = await apiRequest(`/faculty/${id}/pending-actions`);
        if (response?.ok) setPendingActions(Array.isArray(data.pending_actions) ? data.pending_actions : []);
        else setPendingActionsError(data.message || "Unable to load pending actions.");
        setPendingActionsLoading(false);
      }
    } finally {
      setFacultyLoading(false);
    }
  };

  // Build unique directory filter values from database records.
  const facultyDepartments = useMemo(
    () => [...new Set(facultyStudents.map((s) => s.department).filter(Boolean))].sort(),
    [facultyStudents]
  );
  const facultySemesters = useMemo(
    () => [...new Set(facultyStudents.filter((s) => !selectedDepartment || s.department === selectedDepartment).map((s) => s.semester).filter(Boolean))].sort(),
    [facultyStudents, selectedDepartment]
  );
  const filteredFacultyStudents = useMemo(
    () => facultyStudents.filter((s) => (!selectedDepartment || s.department === selectedDepartment) && (!selectedSemester || String(s.semester) === String(selectedSemester))),
    [facultyStudents, selectedDepartment, selectedSemester]
  );

  // Faculty Certificate picker follows the same Department → Semester → Student hierarchy as Admin.
  const facultyCertificateDepartments = useMemo(
    () => [...new Set(facultyStudents.map((s) => String(s?.department || s?.course || "").trim()).filter(Boolean))].sort(),
    [facultyStudents]
  );

  const facultyCertificateSemesters = useMemo(
    () => [...new Set(facultyStudents
      .filter((s) => !facultyCertificateDepartment || String(s?.department || s?.course || "").trim() === facultyCertificateDepartment)
      .map((s) => String(s?.semester || "").trim())
      .filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [facultyStudents, facultyCertificateDepartment]
  );

  const facultyCertificateStudents = useMemo(
    () => facultyStudents
      .filter((s) => !facultyCertificateDepartment || String(s?.department || s?.course || "").trim() === facultyCertificateDepartment)
      .filter((s) => !facultyCertificateSemester || String(s?.semester || "").trim() === facultyCertificateSemester)
      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || ""))),
    [facultyStudents, facultyCertificateDepartment, facultyCertificateSemester]
  );

  const selectedFacultyCertificateStudent = useMemo(
    () => facultyCertificateStudents.find((s) => String(s.id) === String(facultyCertificateStudentId)) || null,
    [facultyCertificateStudents, facultyCertificateStudentId]
  );

  // Build Admin User Management groupings defensively.
  // These values must always be arrays/objects, even when the API is empty.
  const groupedAdminStudents = useMemo(() => {
    const grouped = {};
    (Array.isArray(adminStudents) ? adminStudents : []).forEach((student) => {
      const department = String(student?.department || student?.course || "Unassigned Department").trim() || "Unassigned Department";
      const semester = String(student?.semester || "Unknown Semester").trim() || "Unknown Semester";
      if (!grouped[department]) grouped[department] = {};
      if (!grouped[department][semester]) grouped[department][semester] = [];
      grouped[department][semester].push(student);
    });
    return grouped;
  }, [adminStudents]);

  const groupedAdminFaculty = useMemo(() => {
    const grouped = {};
    (Array.isArray(adminFaculty) ? adminFaculty : []).forEach((faculty) => {
      const department = String(faculty?.department || "Unassigned Department").trim() || "Unassigned Department";
      if (!grouped[department]) grouped[department] = [];
      grouped[department].push(faculty);
    });
    return grouped;
  }, [adminFaculty]);

  const adminCertificateDepartments = useMemo(() => {
    const students = Array.isArray(adminStudents) ? adminStudents : [];
    return [...new Set(students.map((student) => String(student?.department || student?.course || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }, [adminStudents]);

  const adminCertificateSemesters = useMemo(() => {
    const students = Array.isArray(adminStudents) ? adminStudents : [];
    return [...new Set(students
      .filter((student) => !adminCertificateDepartment || String(student?.department || student?.course || "").trim() === adminCertificateDepartment)
      .map((student) => String(student?.semester || "").trim())
      .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [adminStudents, adminCertificateDepartment]);

  const adminCertificateStudents = useMemo(() => {
    const students = Array.isArray(adminStudents) ? adminStudents : [];
    return students
      .filter((student) => !adminCertificateDepartment || String(student?.department || student?.course || "").trim() === adminCertificateDepartment)
      .filter((student) => !adminCertificateSemester || String(student?.semester || "").trim() === adminCertificateSemester)
      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
  }, [adminStudents, adminCertificateDepartment, adminCertificateSemester]);

  const selectedAdminCertificateStudent = useMemo(
    () => (Array.isArray(adminCertificateStudents) ? adminCertificateStudents : []).find((student) => String(student.id) === String(adminCertificateStudentId)) || null,
    [adminCertificateStudents, adminCertificateStudentId]
  );

  const adminHostelAuthorities = useMemo(() => {
    return (Array.isArray(adminFaculty) ? adminFaculty : [])
      .filter((faculty) => {
        const role = String(faculty?.hostel_role || "Faculty").toLowerCase();
        return role === "warden" || role === "assistant warden";
      })
      .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
  }, [adminFaculty]);

  // Open a read-only Student Profile for exactly the Student that was clicked.
  const handleViewStudentProfile = async (student) => {
    const studentId = Number(student?.id);
    if (!Number.isInteger(studentId) || studentId < 1) return;

    setSelectedStudent(student);
    setStudentProfileOpen(true);
    setSelectedStudentAcademic(null);
    setFacultyStudentCertificates([]);
    setFacultyStudentCertificatesError("");
    setFacultyStudentCertificatesLoading(true);

    const [profile, attendance, timetable, assignments, applications, issues, certificates, fees, gatePasses] = await Promise.all([
      apiRequest(`/students/${studentId}`),
      apiRequest(`/students/${studentId}/attendance`),
      apiRequest(`/students/${studentId}/timetable`),
      apiRequest(`/students/${studentId}/assignments`),
      apiRequest(`/students/${studentId}/applications`),
      apiRequest(`/students/${studentId}/campus-issues`),
      apiRequest(`/students/${studentId}/certificates`),
      apiRequest(`/students/${studentId}/fees`),
      apiRequest(`/students/${studentId}/gate-passes`),
    ]);

    const freshStudent = profile.response?.ok && profile.data?.student
      ? profile.data.student
      : student;

    setSelectedStudent(freshStudent);

    const certificatesList = certificates.response?.ok && Array.isArray(certificates.data?.certificates)
      ? certificates.data.certificates
      : [];
    setFacultyStudentCertificates(certificatesList);

    if (!certificates.response?.ok) {
      setFacultyStudentCertificatesError(certificates.data.message || "Unable to load certificates for this student.");
    }

    setSelectedStudentAcademic({
      attendance: attendance.response?.ok && Array.isArray(attendance.data?.attendance) ? attendance.data.attendance : [],
      timetable: timetable.response?.ok && Array.isArray(timetable.data?.timetable) ? timetable.data.timetable : [],
      assignments: assignments.response?.ok && Array.isArray(assignments.data?.assignments) ? assignments.data.assignments : [],
      applications: applications.response?.ok && Array.isArray(applications.data?.applications) ? applications.data.applications : [],
      campusIssues: issues.response?.ok && Array.isArray(issues.data?.issues) ? issues.data.issues : [],
      certificates: certificatesList,
      fees: fees.response?.ok && Array.isArray(fees.data?.fees) ? fees.data.fees : [],
      gatePasses: gatePasses.response?.ok && Array.isArray(gatePasses.data?.gate_passes) ? gatePasses.data.gate_passes : [],
    });

    setFacultyStudentCertificatesLoading(false);
  };

  // Load certificates only for the Student selected in the Faculty Certificate form.
  const handleFacultyCertificateStudentChange = async (studentId) => {
    setFacultyCertificateStudentId(studentId);
    setFacultyStudentCertificates([]);
    setFacultyStudentCertificatesError("");

    if (!studentId) return;

    setFacultyStudentCertificatesLoading(true);
    const { response, data } = await apiRequest(`/students/${Number(studentId)}/certificates`);
    if (response?.ok) {
      setFacultyStudentCertificates(Array.isArray(data.certificates) ? data.certificates : []);
    } else {
      setFacultyStudentCertificatesError(data.message || "Unable to load certificates for the selected student.");
    }
    setFacultyStudentCertificatesLoading(false);
  };

  // Close the read-only Student Profile modal.
  const closeStudentProfile = () => {
    setStudentProfileOpen(false);
    setSelectedStudent(null);
    setSelectedStudentAcademic(null);
    setFacultyStudentCertificates([]);
    setFacultyStudentCertificatesError("");
  };

  // Validate and save Faculty attendance for any registered student.
  const handleFacultyAttendanceSubmit = async (event) => {
    event.preventDefault();
    setFacultyAttendanceError("");
    const attended = Number(attendanceAttended);
    const total = Number(attendanceTotal);
    if (!attendanceStudentId || !attendanceSubject.trim()) {
      setFacultyAttendanceError("Student and subject are required.");
      return;
    }
    if (!Number.isInteger(attended) || !Number.isInteger(total) || total <= 0 || attended < 0 || attended > total) {
      setFacultyAttendanceError("Attended classes must be between 0 and total classes.");
      return;
    }

    setAttendanceSubmitting(true);
    const { response, data } = await apiRequest(`/faculty/${facultyData.id}/attendance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: Number(attendanceStudentId), subject: attendanceSubject.trim(), attended_classes: attended, total_classes: total }),
    });
    if (response?.ok && data.success !== false) {
      setAttendanceSubject("");
      setAttendanceAttended("");
      setAttendanceTotal("");
      setFacultyMessage(data.message || "Attendance updated successfully.");
      await openFacultySection("attendance");
    } else setFacultyAttendanceError(data.message || "Unable to update attendance.");
    setAttendanceSubmitting(false);
  };

  // Validate class times before adding a timetable record.
  const handleFacultyTimetableSubmit = async (event) => {
    event.preventDefault();
    setFacultyTimetableError("");
    if (timetableEndTime <= timetableStartTime) {
      setFacultyTimetableError("End time must be after start time.");
      return;
    }
    setTimetableSubmitting(true);
    const { response, data } = await apiRequest(`/faculty/${facultyData.id}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course: timetableCourse.trim(), semester: timetableSemester.trim(), day: timetableDay, subject: timetableSubject.trim(), start_time: timetableStartTime, end_time: timetableEndTime, room: timetableRoom.trim() }),
    });
    if (response?.ok && data.success !== false) {
      setTimetableSubject("");
      setTimetableStartTime("");
      setTimetableEndTime("");
      setTimetableRoom("");
      setFacultyMessage(data.message || "Timetable created successfully.");
      await openFacultySection("timetable");
    } else setFacultyTimetableError(data.message || "Unable to create timetable.");
    setTimetableSubmitting(false);
  };

  // Create an assignment for a course and semester.
  // Load the Faculty member's own submitted applications.
  const loadFacultyMyApplications = async () => {
    if (!facultyData?.id) return;
    setFacultyMyApplicationsLoading(true);
    setFacultyMyApplicationsError("");
    const { response, data } = await apiRequest(`/faculty/${facultyData.id}/my-applications`);
    if (response?.ok && data.success !== false) {
      setFacultyMyApplications(Array.isArray(data.applications) ? data.applications : []);
    } else {
      setFacultyMyApplicationsError(data.message || "Unable to load your applications.");
    }
    setFacultyMyApplicationsLoading(false);
  };

  // Submit an application as Faculty. It goes directly to Admin/authority.
  const handleFacultyApplicationSubmit = async (event) => {
    event.preventDefault();
    setFacultyApplicationMessage("");
    setFacultyMyApplicationsError("");

    if (!facultyApplicationTitle.trim() || !facultyApplicationDescription.trim()) {
      setFacultyMyApplicationsError("Title and description are required.");
      return;
    }
    if (facultyApplicationStartDate && facultyApplicationEndDate && facultyApplicationEndDate < facultyApplicationStartDate) {
      setFacultyMyApplicationsError("End date cannot be before start date.");
      return;
    }

    setFacultyApplicationSubmitting(true);
    const { response, data } = await apiRequest(`/faculty/${facultyData.id}/applications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicant_id: facultyData.id,
        applicant_role: "Faculty",
        application_type: facultyApplicationType,
        title: facultyApplicationTitle.trim(),
        description: facultyApplicationDescription.trim(),
        start_date: facultyApplicationStartDate || null,
        end_date: facultyApplicationEndDate || null,
      }),
    });

    if (response?.ok && data.success !== false) {
      setFacultyApplicationTitle("");
      setFacultyApplicationDescription("");
      setFacultyApplicationStartDate("");
      setFacultyApplicationEndDate("");
      setFacultyApplicationFormOpen(false);
      setFacultyApplicationMessage(data.message || "Application submitted to Admin.");
      await loadFacultyMyApplications();
    } else {
      setFacultyMyApplicationsError(data.message || "Unable to submit your application.");
    }
    setFacultyApplicationSubmitting(false);
  };

  const handleFacultyAssignmentSubmit = async (event) => {
    event.preventDefault();
    setFacultyAssignmentsError("");
    setFacultyAssignmentSubmitting(true);
    const { response, data } = await apiRequest(`/faculty/${facultyData.id}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course: facultyAssignmentCourse.trim(), semester: facultyAssignmentSemester.trim(), subject: facultyAssignmentSubject.trim(), title: facultyAssignmentTitle.trim(), description: facultyAssignmentDescription.trim(), due_date: facultyAssignmentDueDate }),
    });
    if (response?.ok && data.success !== false) {
      setFacultyAssignmentTitle("");
      setFacultyAssignmentDescription("");
      setFacultyAssignmentDueDate("");
      setFacultyMessage(data.message || "Assignment created successfully.");
      await openFacultySection("assignments");
    } else setFacultyAssignmentsError(data.message || "Unable to create assignment.");
    setFacultyAssignmentSubmitting(false);
  };

  // Faculty reviews a Student submission and controls the academic status.
  const handleFacultyAssignmentReview = async (assignmentId) => {
    const draft = facultyAssignmentReviewDrafts[assignmentId] || {};
    if (!draft.status) return;

    setFacultyAssignmentReviewingId(assignmentId);
    setFacultyAssignmentsError("");

    const { response, data } = await apiRequest(`/faculty/${facultyData.id}/assignments/${assignmentId}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: draft.status,
        review_comment: draft.comment || "",
      }),
    });

    if (response?.ok && data.success !== false) {
      setFacultyMessage(data.message || "Assignment status updated successfully.");
      await openFacultySection("assignments");
    } else {
      setFacultyAssignmentsError(data.message || "Unable to update assignment status.");
    }

    setFacultyAssignmentReviewingId(null);
  };

  // Approve a Student application and refresh the queue.
  const handleApproveApplication = async (id) => {
    setProcessingApplicationId(id);
    const query = new URLSearchParams({ approver_role: "Faculty", approver_id: String(facultyData.id) });
    const { response, data } = await apiRequest(`/applications/${id}/approve?${query}`, { method: "PUT" });
    if (response?.ok && data.success !== false) {
      setFacultyMessage(data.message || "Application approved.");
      await openFacultySection("applications");
    } else setFacultyApplicationsError(data.message || "Unable to approve application.");
    setProcessingApplicationId(null);
  };

  // Reject a Student application and refresh the queue.
  const handleRejectApplication = async (id) => {
    setProcessingApplicationId(id);
    const query = new URLSearchParams({ approver_role: "Faculty", approver_id: String(facultyData.id) });
    const { response, data } = await apiRequest(`/applications/${id}/reject?${query}`, { method: "PUT" });
    if (response?.ok && data.success !== false) {
      setFacultyMessage(data.message || "Application rejected.");
      await openFacultySection("applications");
    } else setFacultyApplicationsError(data.message || "Unable to reject application.");
    setProcessingApplicationId(null);
  };

  // Approve a gate pass and refresh the queue.
  const handleApproveGatePass = async (pass) => {
    if (!pass?.id || !pass.current_approver_role) return;

    setProcessingGatePassId(pass.id);
    setFacultyGatePassesError("");

    const stageRole = pass.current_approver_role;
    const query = new URLSearchParams({
      approver_role: stageRole,
      approver_id: String(facultyData.id)
    });

    const { response, data } = await apiRequest(
      `/hostel/gate-passes/${pass.id}/approve?${query}`,
      { method: "PUT" }
    );

    if (response?.ok && data.success !== false) {
      setFacultyMessage(data.message || "Gate pass approval recorded.");
      await openFacultySection("gatepasses");
    } else {
      setFacultyGatePassesError(data.message || "Unable to approve gate pass.");
    }

    setProcessingGatePassId(null);
  };

  // Reject a gate pass and refresh the queue.
  const handleRejectGatePass = async (pass) => {
    if (!pass?.id || !pass.current_approver_role) return;

    setProcessingGatePassId(pass.id);
    setFacultyGatePassesError("");

    const stageRole = pass.current_approver_role;
    const query = new URLSearchParams({
      approver_role: stageRole,
      approver_id: String(facultyData.id)
    });

    const { response, data } = await apiRequest(
      `/hostel/gate-passes/${pass.id}/reject?${query}`,
      { method: "PUT" }
    );

    if (response?.ok && data.success !== false) {
      setFacultyMessage(data.message || "Gate pass rejected.");
      await openFacultySection("gatepasses");
    } else {
      setFacultyGatePassesError(data.message || "Unable to reject gate pass.");
    }

    setProcessingGatePassId(null);
  };

  // Publish a targeted campus notice.
  const handleFacultyNoticeSubmit = async (event) => {
    event.preventDefault();
    setFacultyError("");
    if (facultyNoticeTargetType !== "All" && !facultyNoticeTargetValue.trim()) {
      setFacultyError("Target value is required for Course or Semester notices.");
      return;
    }
    setFacultyNoticeSubmitting(true);
    const { response, data } = await apiRequest(`/faculty/${facultyData.id}/notices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: facultyNoticeTitle.trim(), content: facultyNoticeContent.trim(), target_type: facultyNoticeTargetType, target_value: facultyNoticeTargetType === "All" ? null : facultyNoticeTargetValue.trim() }),
    });
    if (response?.ok && data.success !== false) {
      setFacultyNoticeTitle("");
      setFacultyNoticeContent("");
      setFacultyNoticeTargetValue("");
      setFacultyMessage(data.message || "Notice published successfully.");
    } else setFacultyError(data.message || "Unable to publish notice.");
    setFacultyNoticeSubmitting(false);
  };

  // Issue a certificate to a registered Student.
  const handleFacultyCertificateSubmit = async (event) => {
    event.preventDefault();
    setFacultyError("");
    const studentId = Number(facultyCertificateStudentId);
    if (!Number.isInteger(studentId) || studentId < 1) {
      setFacultyError("Please enter a valid Student ID.");
      return;
    }
    setFacultyCertificateSubmitting(true);
    let filePath = null;
    if (facultyCertificateFile) {
      const upload = await uploadCertificateFile(facultyCertificateFile, studentId, "Faculty", facultyData.id);
      if (!upload.success) {
        setFacultyError(upload.message || "Unable to upload proof file.");
        setFacultyCertificateSubmitting(false);
        return;
      }
      filePath = upload.filePath;
    }

    const { response, data } = await apiRequest(`/faculty/${facultyData.id}/certificates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId, title: facultyCertificateTitle.trim(), certificate_type: facultyCertificateType, certificate_date: facultyCertificateDate || null, file_path: filePath, uploaded_by_role: "Faculty", uploaded_by_id: facultyData.id, issued_by: facultyData.name }),
    });
    if (response?.ok && data.success !== false) {
      // Keep the exact Department → Semester → Student selection visible.
      // Refresh only that student's certificate list so no unrelated data can appear.
      setFacultyCertificateTitle("");
      setFacultyCertificateDate("");
      setFacultyCertificateFile(null);
      setFacultyMessage(data.message || "Certificate issued successfully.");
      await handleFacultyCertificateStudentChange(String(studentId));
    } else setFacultyError(data.message || "Unable to issue certificate.");
    setFacultyCertificateSubmitting(false);
  };

  // Submit a Faculty grievance.
  const handleFacultyComplaintSubmit = async (event) => {
    event.preventDefault();
    setFacultyComplaintsError("");
    setFacultyComplaintMessage("");
    setFacultyComplaintSubmitting(true);

    let photoPath = null;
    if (facultyComplaintPhoto) {
      const photoForm = new FormData();
      photoForm.append("faculty_id", String(facultyData.id));
      photoForm.append("file", facultyComplaintPhoto);
      const photoResult = await apiRequest("/complaints/upload-photo", {
        method: "POST",
        body: photoForm,
      });
      if (!photoResult.response?.ok) {
        setFacultyComplaintsError(photoResult.data.message || "Unable to upload complaint photo.");
        setFacultyComplaintSubmitting(false);
        return;
      }
      photoPath = photoResult.data.file_path || null;
    }

    const { response, data } = await apiRequest("/complaints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ complainant_id: facultyData.id, complainant_role: "Faculty", category: facultyComplaintCategory, title: facultyComplaintTitle.trim(), description: facultyComplaintDescription.trim(), assigned_to_role: facultyComplaintAuthority, photo_path: photoPath }),
    });
    if (response?.ok && data.success !== false) {
      setFacultyComplaintTitle("");
      setFacultyComplaintDescription("");
      setFacultyComplaintPhoto(null);
      setFacultyComplaintFormOpen(false);
      setFacultyComplaintMessage(data.message || "Complaint submitted successfully.");
      await openFacultySection("complaints");
    } else setFacultyComplaintsError(data.message || "Unable to submit complaint.");
    setFacultyComplaintSubmitting(false);
  };

  // ============================================================
  // ADMIN DASHBOARD DATA
  // ============================================================

  // Load live Admin dashboard totals from the database.
  const loadAdminDashboardSummary = async () => {
    setAdminSummaryLoading(true);
    setAdminSummaryError("");

    const { response, data } = await apiRequest("/admin/dashboard-summary");

    if (response?.ok && data.success !== false) {
      setAdminSummary(data.summary || {});
    } else {
      setAdminSummaryError(data.message || "Unable to load Admin dashboard summary.");
    }

    setAdminSummaryLoading(false);
  };

  // Load all registered students and faculty for Admin User Management.
  const loadAdminUsers = async () => {
    setAdminUsersLoading(true);
    setAdminUsersError("");

    const search = adminUserSearch.trim();
    const query = search ? `?search=${encodeURIComponent(search)}` : "";

    const [studentsResult, facultyResult] = await Promise.all([
      apiRequest(`/admin/students${query}`),
      apiRequest(`/admin/faculty${query}`),
    ]);

    const errors = [];

    if (studentsResult.response?.ok) {
      setAdminStudents(Array.isArray(studentsResult.data.students) ? studentsResult.data.students : []);
    } else {
      errors.push(studentsResult.data.message || "Unable to load students.");
    }

    if (facultyResult.response?.ok) {
      setAdminFaculty(Array.isArray(facultyResult.data.faculty) ? facultyResult.data.faculty : []);
    } else {
      errors.push(facultyResult.data.message || "Unable to load faculty.");
    }

    if (errors.length) setAdminUsersError(errors.join(" "));
    setAdminUsersLoading(false);
  };

  // Load all campus complaints/issues for Admin.
  const loadAdminComplaints = async () => {
    setAdminComplaintsLoading(true);
    setAdminComplaintsError("");
    setAdminComplaintsMessage("");

    const { response, data } = await apiRequest("/campus-issues");

    if (response?.ok && data.success !== false) {
      const issues = Array.isArray(data.issues) ? data.issues : [];
      setAdminComplaints(issues);

      // Start each editor with the current database value.
      setAdminComplaintStatusDrafts(
        Object.fromEntries(issues.map((issue) => [issue.id, issue.status || "Pending"]))
      );
      setAdminComplaintDepartmentDrafts(
        Object.fromEntries(issues.map((issue) => [issue.id, issue.assigned_department || ""]))
      );
    } else {
      setAdminComplaintsError(data.message || "Unable to load campus complaints.");
    }

    setAdminComplaintsLoading(false);
  };

  // Update one complaint's status and assigned department.
  const handleAdminComplaintUpdate = async (issueId) => {
    const status = adminComplaintStatusDrafts[issueId] || "Pending";
    const department = adminComplaintDepartmentDrafts[issueId] || "";

    setAdminComplaintsError("");
    setAdminComplaintsMessage("");
    setAdminComplaintUpdatingId(issueId);

    const params = new URLSearchParams({ status });
    if (department) params.set("assigned_department", department);

    const { response, data } = await apiRequest(
      `/campus-issues/${issueId}/update?${params.toString()}`,
      { method: "PUT" }
    );

    if (response?.ok && data.success !== false) {
      setAdminComplaintsMessage(data.message || "Complaint updated successfully.");
      await loadAdminComplaints();
      await loadAdminDashboardSummary();
    } else {
      setAdminComplaintsError(data.message || "Unable to update complaint.");
    }

    setAdminComplaintUpdatingId(null);
  };

  // Load every campus application for Admin management.
  const loadAdminApplications = async () => {
    setAdminApplicationsLoading(true);
    setAdminApplicationsError("");
    setAdminApplicationsMessage("");

    const { response, data } = await apiRequest("/applications");

    if (response?.ok && data.success !== false) {
      setAdminApplications(Array.isArray(data.applications) ? data.applications : []);
    } else {
      setAdminApplicationsError(data.message || "Unable to load applications.");
    }

    setAdminApplicationsLoading(false);
  };

  // Approve an application from the Admin dashboard.
  const handleAdminApplicationDecision = async (applicationId, decision) => {
    setAdminApplicationProcessingId(applicationId);
    setAdminApplicationsError("");
    setAdminApplicationsMessage("");

    const query = new URLSearchParams({
      approver_role: "Admin",
      approver_id: String(adminData?.id || ""),
    });

    const endpoint = decision === "approve"
      ? `/applications/${applicationId}/approve?${query.toString()}`
      : `/applications/${applicationId}/reject?${query.toString()}`;

    const { response, data } = await apiRequest(endpoint, { method: "PUT" });

    if (response?.ok && data.success !== false) {
      setAdminApplicationsMessage(
        data.message || `Application ${decision === "approve" ? "approved" : "rejected"} successfully.`
      );
      await loadAdminApplications();
      await loadAdminDashboardSummary();
    } else {
      setAdminApplicationsError(data.message || `Unable to ${decision} application.`);
    }

    setAdminApplicationProcessingId(null);
  };

  // Load every gate-pass request for Admin monitoring.
  const loadAdminGatePasses = async () => {
    setAdminGatePassesLoading(true);
    setAdminGatePassesError("");
    setAdminGatePassesMessage("");

    const { response, data } = await apiRequest("/admin/gate-passes");

    if (response?.ok && data.success !== false) {
      setAdminGatePasses(Array.isArray(data.gate_passes) ? data.gate_passes : []);
    } else {
      setAdminGatePassesError(data.message || "Unable to load gate pass requests.");
    }

    setAdminGatePassesLoading(false);
  };

  // Approve or reject a gate-pass request from the Admin dashboard.
  const handleAdminGatePassDecision = async (gatePassId, decision) => {
    setAdminGatePassProcessingId(gatePassId);
    setAdminGatePassesError("");
    setAdminGatePassesMessage("");

    const query = new URLSearchParams({
      approver_role: "Admin",
      approver_id: String(adminData?.id || ""),
    });

    const endpoint = decision === "approve"
      ? `/hostel/gate-passes/${gatePassId}/approve?${query.toString()}`
      : `/hostel/gate-passes/${gatePassId}/reject?${query.toString()}`;

    const { response, data } = await apiRequest(endpoint, { method: "PUT" });

    if (response?.ok && data.success !== false) {
      setAdminGatePassesMessage(
        data.message ||
        `Gate pass ${decision === "approve" ? "approved" : "rejected"} successfully.`
      );
      await loadAdminGatePasses();
      await loadAdminDashboardSummary();
    } else {
      setAdminGatePassesError(
        data.message ||
        `Unable to ${decision} the gate pass.`
      );
    }

    setAdminGatePassProcessingId(null);
  };

  const handleAdminFacultyHostelRoleUpdate = async (facultyId) => {
    const hostelRole = adminFacultyHostelRoleDrafts[facultyId] || "Faculty";
    setAdminFacultyHostelRoleSavingId(facultyId);
    const { response, data } = await apiRequest(`/admin/faculty/${facultyId}?hostel_role=${encodeURIComponent(hostelRole)}`, { method: "PUT" });
    if (response?.ok && data.success !== false) {
      await loadAdminUsers();
    } else {
      setAdminUsersError(data.message || "Unable to update hostel authority role.");
    }
    setAdminFacultyHostelRoleSavingId(null);
  };

  // Open an Admin section and load its data when necessary.
  // Load all Faculty grievances for Admin.
  const loadAdminFacultyComplaints = async () => {
    setAdminFacultyComplaintsLoading(true);
    setAdminFacultyComplaintsError("");
    const { response, data } = await apiRequest("/admin/complaints");
    if (response?.ok && data.success !== false) {
      const records = Array.isArray(data.complaints) ? data.complaints : [];
      setAdminFacultyComplaints(records);
      setAdminFacultyComplaintStatusDrafts(Object.fromEntries(records.map((item) => [item.id, item.status || "Pending"])));
      setAdminFacultyComplaintResponseDrafts(Object.fromEntries(records.map((item) => [item.id, item.admin_response || ""])));
    } else {
      setAdminFacultyComplaintsError(data.message || "Unable to load Faculty complaints.");
    }
    setAdminFacultyComplaintsLoading(false);
  };

  const handleAdminFacultyComplaintUpdate = async (id) => {
    setAdminFacultyComplaintUpdatingId(id);
    const body = {
      status: adminFacultyComplaintStatusDrafts[id] || "Pending",
      admin_response: adminFacultyComplaintResponseDrafts[id] || null,
      assigned_to_role: "Faculty",
    };
    const { response, data } = await apiRequest(`/admin/complaints/${id}/update`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response?.ok && data.success !== false) {
      await loadAdminFacultyComplaints();
      await loadAdminDashboardSummary();
    } else {
      setAdminFacultyComplaintsError(data.message || "Unable to update Faculty complaint.");
    }
    setAdminFacultyComplaintUpdatingId(null);
  };

  // Load all certificates for Admin.
  const loadAdminCertificates = async () => {
    setAdminCertificatesLoading(true);
    setAdminCertificatesError("");
    const { response, data } = await apiRequest("/admin/certificates");
    if (response?.ok && data.success !== false) setAdminCertificates(Array.isArray(data.certificates) ? data.certificates : []);
    else setAdminCertificatesError(data.message || "Unable to load certificates.");
    setAdminCertificatesLoading(false);
  };

  const handleAdminCertificateSubmit = async (event) => {
    event.preventDefault();
    setAdminCertificatesError("");
    setAdminCertificatesMessage("");
    const studentId = Number(adminCertificateStudentId);
    if (!studentId || !adminCertificateTitle.trim()) {
      setAdminCertificatesError("Student and certificate title are required.");
      return;
    }
    setAdminCertificateSubmitting(true);
    let filePath = null;
    if (adminCertificateFile) {
      const formData = new FormData();
      formData.append("file", adminCertificateFile);
      formData.append("student_id", String(studentId));
      formData.append("uploaded_by_role", "Admin");
      formData.append("uploaded_by_id", String(adminData.id));
      const upload = await apiRequest("/certificates/upload", { method: "POST", body: formData });
      if (!upload.response?.ok) {
        setAdminCertificatesError(upload.data.message || "Unable to upload certificate file.");
        setAdminCertificateSubmitting(false);
        return;
      }
      filePath = upload.data.file_path || null;
    }

    const { response, data } = await apiRequest("/admin/certificates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        student_id: studentId,
        title: adminCertificateTitle.trim(),
        certificate_type: adminCertificateType,
        file_path: filePath,
        uploaded_by_role: "Admin",
        uploaded_by_id: adminData.id,
        issued_by: adminData.name,
        certificate_date: adminCertificateDate || null,
      }),
    });

    if (response?.ok && data.success !== false) {
      setAdminCertificateDepartment("");
      setAdminCertificateSemester("");
      setAdminCertificateStudentId("");
      setAdminCertificateTitle("");
      setAdminCertificateDate("");
      setAdminCertificateFile(null);
      setAdminCertificateFormOpen(false);
      setAdminCertificatesMessage(data.message || "Certificate added successfully.");
      await loadAdminCertificates();
      await loadAdminDashboardSummary();
    } else {
      setAdminCertificatesError(data.message || "Unable to add certificate.");
    }
    setAdminCertificateSubmitting(false);
  };

  const handleAdminCertificateDelete = async (id) => {
    const { response, data } = await apiRequest(`/admin/certificates/${id}`, { method: "DELETE" });
    if (response?.ok && data.success !== false) {
      await loadAdminCertificates();
      await loadAdminDashboardSummary();
    } else setAdminCertificatesError(data.message || "Unable to delete certificate.");
  };

  // Load all fees for Admin.
  const loadAdminFees = async () => {
    setAdminFeesLoading(true);
    setAdminFeesError("");
    const { response, data } = await apiRequest("/admin/fees");
    if (response?.ok && data.success !== false) {
      const records = Array.isArray(data.fees) ? data.fees : [];
      setAdminFees(records);
      setAdminFeePaidDrafts(Object.fromEntries(records.map((item) => [item.id, item.paid_amount])));
    } else setAdminFeesError(data.message || "Unable to load fees.");
    setAdminFeesLoading(false);
  };

  const handleAdminFeeSubmit = async (event) => {
    event.preventDefault();
    setAdminFeesError("");
    setAdminFeesMessage("");
    const studentId = Number(adminFeeStudentId);
    const total = Number(adminFeeTotal);
    const paid = Number(adminFeePaid || 0);
    if (!studentId || !adminFeeSemester.trim() || !Number.isFinite(total) || total < 0 || paid < 0) {
      setAdminFeesError("Enter a valid student and fee amount. Paid amount may be greater than total and will be recorded as Overpaid.");
      return;
    }

    setAdminFeeSubmitting(true);
    const { response, data } = await apiRequest("/fees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: studentId, semester: adminFeeSemester.trim(), fee_type: adminFeeType.trim(), total_amount: total, paid_amount: paid, due_date: adminFeeDueDate || null }),
    });

    if (response?.ok && data.success !== false) {
      setAdminFeeStudentId(""); setAdminFeeSemester(""); setAdminFeeTotal(""); setAdminFeePaid(""); setAdminFeeDueDate("");
      setAdminFeeFormOpen(false);
      setAdminFeesMessage(data.message || "Fee record added successfully.");
      await loadAdminFees(); await loadAdminDashboardSummary();
    } else setAdminFeesError(data.message || "Unable to add fee record.");
    setAdminFeeSubmitting(false);
  };

  const handleAdminFeeUpdate = async (id) => {
    setAdminFeeUpdatingId(id);
    const { response, data } = await apiRequest(`/admin/fees/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paid_amount: Number(adminFeePaidDrafts[id]) }),
    });
    if (response?.ok && data.success !== false) {
      await loadAdminFees(); await loadAdminDashboardSummary();
    } else setAdminFeesError(data.message || "Unable to update fee record.");
    setAdminFeeUpdatingId(null);
  };

  // Move an overpaid amount from one semester fee record to another
  // fee record belonging to the same student.
  const handleAdminFeeTransferCredit = async (sourceFeeId) => {
    const targetFeeId = Number(adminFeeTransferTargetDrafts[sourceFeeId]);
    const amountValue = adminFeeTransferAmountDrafts[sourceFeeId];
    const amount = amountValue === "" || amountValue === undefined ? null : Number(amountValue);

    if (!targetFeeId) {
      setAdminFeesError("Select the target semester before transferring credit.");
      return;
    }
    if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
      setAdminFeesError("Enter a valid credit transfer amount.");
      return;
    }

    setAdminFeeTransferProcessingId(sourceFeeId);
    setAdminFeesError("");
    const { response, data } = await apiRequest(`/admin/fees/${sourceFeeId}/transfer-credit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_fee_id: targetFeeId, amount }),
    });

    if (response?.ok && data.success !== false) {
      setAdminFeesMessage(data.message || "Fee credit transferred successfully.");
      await loadAdminFees();
      await loadAdminDashboardSummary();
    } else {
      setAdminFeesError(data.message || "Unable to transfer fee credit.");
    }
    setAdminFeeTransferProcessingId(null);
  };

  // Load/create/delete Admin notices.
  const loadAdminNotices = async () => {
    setAdminNoticesLoading(true); setAdminNoticesError("");
    const { response, data } = await apiRequest("/admin/notices");
    if (response?.ok && data.success !== false) setAdminNotices(Array.isArray(data.notices) ? data.notices : []);
    else setAdminNoticesError(data.message || "Unable to load notices.");
    setAdminNoticesLoading(false);
  };

  const handleAdminNoticeSubmit = async (event) => {
    event.preventDefault();
    setAdminNoticesError(""); setAdminNoticesMessage("");
    if (!adminNoticeTitle.trim() || !adminNoticeContent.trim()) { setAdminNoticesError("Title and content are required."); return; }
    if (adminNoticeTargetType !== "All" && !adminNoticeTargetValue.trim()) { setAdminNoticesError("Target value is required."); return; }
    setAdminNoticeSubmitting(true);
    const { response, data } = await apiRequest("/admin/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: adminNoticeTitle.trim(), content: adminNoticeContent.trim(), target_type: adminNoticeTargetType, target_value: adminNoticeTargetType === "All" ? null : adminNoticeTargetValue.trim() }),
    });
    if (response?.ok && data.success !== false) {
      setAdminNoticeTitle(""); setAdminNoticeContent(""); setAdminNoticeTargetValue(""); setAdminNoticeFormOpen(false);
      setAdminNoticesMessage(data.message || "Notice published successfully.");
      await loadAdminNotices(); await loadAdminDashboardSummary();
    } else setAdminNoticesError(data.message || "Unable to publish notice.");
    setAdminNoticeSubmitting(false);
  };

  const handleAdminNoticeDelete = async (id) => {
    setAdminNoticeDeletingId(id);
    const { response, data } = await apiRequest(`/admin/notices/${id}`, { method: "DELETE" });
    if (response?.ok && data.success !== false) { await loadAdminNotices(); await loadAdminDashboardSummary(); }
    else setAdminNoticesError(data.message || "Unable to delete notice.");
    setAdminNoticeDeletingId(null);
  };

  // Load the Admin analytics report.
  const loadAdminReports = async () => {
    setAdminReportsLoading(true); setAdminReportsError("");
    const { response, data } = await apiRequest("/admin/reports");
    if (response?.ok && data.success !== false) setAdminReports(data.reports || {});
    else setAdminReportsError(data.message || "Unable to load reports.");
    setAdminReportsLoading(false);
  };

  // Allow Admin to explicitly assign departments to existing students.
  const handleAdminStudentDepartmentUpdate = async (studentId) => {
    const department = adminStudentDepartmentDrafts[studentId] || "";
    if (!department.trim()) { setAdminUsersError("Please enter a department first."); return; }
    setAdminStudentDepartmentSavingId(studentId);
    const { response, data } = await apiRequest(`/admin/students/${studentId}?department=${encodeURIComponent(department.trim())}`, { method: "PUT" });
    if (response?.ok && data.success !== false) {
      await loadAdminUsers();
    } else setAdminUsersError(data.message || "Unable to update student department.");
    setAdminStudentDepartmentSavingId(null);
  };

  // Open an Admin section and load its data when necessary.
  const openAdminSection = async (section) => {
    setAdminSection(section);
    setAdminUsersError("");

    if (section === "overview") {
      await loadAdminDashboardSummary();
    }

    if (section === "users") {
      await loadAdminUsers();
    }

    if (section === "complaints") {
      await Promise.all([loadAdminComplaints(), loadAdminFacultyComplaints()]);
    }

    if (section === "applications") {
      await loadAdminApplications();
    }

    if (section === "gatepasses") {
      await Promise.all([loadAdminGatePasses(), loadAdminUsers()]);
    }

    if (section === "certificates") {
      await Promise.all([loadAdminCertificates(), loadAdminUsers()]);
    }

    if (section === "fees") {
      await Promise.all([loadAdminFees(), loadAdminUsers()]);
    }

    if (section === "notices") {
      await loadAdminNotices();
    }

    if (section === "reports") {
      await loadAdminReports();
    }
  };

  // Create a Student from the Admin dashboard.
  const handleAdminStudentSubmit = async (event) => {
    event.preventDefault();
    setAdminUsersError("");

    if (adminStudentPassword && adminStudentPassword.length < 8) {
      setAdminUsersError("Student password must contain at least 8 characters.");
      return;
    }

    setAdminStudentSubmitting(true);

    const { response, data } = await apiRequest("/admin/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: adminStudentName.trim(),
        roll_number: adminStudentRoll.trim(),
        course: adminStudentCourse.trim(),
        semester: adminStudentSemester.trim(),
        department: adminStudentDepartment.trim() || null,
        email: adminStudentEmail.trim(),
        password: adminStudentPassword || null,
      }),
    });

    if (response?.ok && data.success !== false) {
      setAdminStudentName("");
      setAdminStudentRoll("");
      setAdminStudentCourse("");
      setAdminStudentSemester("");
      setAdminStudentDepartment("");
      setAdminStudentEmail("");
      setAdminStudentPassword("");
      setAdminStudentFormOpen(false);
      await loadAdminUsers();
      await loadAdminDashboardSummary();
    } else {
      setAdminUsersError(data.message || "Unable to create student.");
    }

    setAdminStudentSubmitting(false);
  };

  // Create a Faculty member from the Admin dashboard.
  const handleAdminFacultySubmit = async (event) => {
    event.preventDefault();
    setAdminUsersError("");

    if (adminFacultyPassword && adminFacultyPassword.length < 8) {
      setAdminUsersError("Faculty password must contain at least 8 characters.");
      return;
    }

    setAdminFacultySubmitting(true);

    const { response, data } = await apiRequest("/admin/faculty", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: adminFacultyName.trim(),
        employee_id: adminFacultyEmployeeId.trim(),
        department: adminFacultyDepartment.trim(),
        designation: adminFacultyDesignation.trim(),
        email: adminFacultyEmail.trim(),
        password: adminFacultyPassword || null,
        hostel_role: adminFacultyHostelRole,
      }),
    });

    if (response?.ok && data.success !== false) {
      setAdminFacultyName("");
      setAdminFacultyEmployeeId("");
      setAdminFacultyDepartment("");
      setAdminFacultyDesignation("");
      setAdminFacultyEmail("");
      setAdminFacultyPassword("");
      setAdminFacultyHostelRole("Faculty");
      setAdminFacultyFormOpen(false);
      await loadAdminUsers();
      await loadAdminDashboardSummary();
    } else {
      setAdminUsersError(data.message || "Unable to create faculty member.");
    }

    setAdminFacultySubmitting(false);
  };

  // Reset every role-specific state when Student logs out.
  // Open the database-aware read-only AI Assistant.
  const handleOpenAI = () => {
    if (!studentData?.id) return;
    closeStudentPanels();
    setStudentActiveModule("ai-assistant");
    setAiOpen(true);
    setAiError("");
  };

  // Send a student question to the database-aware AI backend.
  const handleStudentAI = async (event) => {
    event.preventDefault();
    if (!studentData?.id || !aiQuestion.trim()) return;

    setAiLoading(true);
    setAiError("");
    setAiAnswer("");

    const { response, data } = await apiRequest("/ai/student-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ student_id: Number(studentData.id), question: aiQuestion.trim() }),
    });

    if (response?.ok && data.success !== false) {
      setAiAnswer(data.answer || "No answer was returned.");
    } else {
      setAiError(data.message || "Unable to contact the Omni360 AI Assistant.");
    }

    setAiLoading(false);
  };

  const handleStudentLogout = () => {
    setStudentData(null);
    setStudentDashboardOpen(false);
    setStudentActiveModule("");
    setAuthEmail("");
    setAuthPassword("");
    setProfilePhotoMessage("");
    setProfilePhotoError("");
    setAttendanceData([]); setTimetableData([]); setAssignmentData([]); setNoticeData([]);
    setAiQuestion(""); setAiAnswer(""); setAiError(""); setAiOpen(false);
    setApplicationData([]); setCampusIssueData([]); setCertificateData([]); setFeeData([]); setGatePassData([]);
    setAttendanceOpen(false); setTimetableOpen(false); setAssignmentOpen(false); setNoticeOpen(false); setApplicationOpen(false); setCampusIssueOpen(false); setCertificateOpen(false); setFeeOpen(false); setHostelOpen(false);
  };

  // Reset Faculty state when Faculty logs out.
  const handleFacultyLogout = () => {
    setFacultyData(null);
    setFacultyDashboardOpen(false);
    setAuthEmail("");
    setAuthPassword("");
    setProfilePhotoMessage("");
    setProfilePhotoError("");
    setFacultySection("home");
    setSelectedStudent(null);
    setStudentProfileOpen(false);
  };

  // Reset Admin state when Admin logs out.
  const handleAdminLogout = () => {
    setAdminData(null);
    setAdminDashboardOpen(false);
    setAuthEmail("");
    setAuthPassword("");
    setProfilePhotoMessage("");
    setProfilePhotoError("");
    setAdminSection("overview");
    setAdminCertificateDepartment("");
    setAdminCertificateSemester("");
    setAdminCertificateStudentId("");
    setAdminStudents([]);
    setAdminFaculty([]);
    setAdminUsersError("");
    setAdminUserSearch("");
    setAdminSummaryError("");
    setAdminSummaryLoading(false);
    setAdminSummary({
      total_students: 0,
      total_faculty: 0,
      total_applications: 0,
      pending_applications: 0,
      total_complaints: 0,
      open_complaints: 0,
      total_gate_passes: 0,
      pending_gate_passes: 0,
      total_certificates: 0,
      students_with_pending_fees: 0,
      hostel_residents: 0,
      total_notices: 0,
    });
  };

  return (
    <div className="app">
      {/* Main navigation bar. */}
      <nav className="navbar">
        <button className="menu-button" onClick={() => setMenuOpen(true)}>☰</button>
        <div className="logo">Omni<span>360</span></div>
        {!studentDashboardOpen && !facultyDashboardOpen && !adminDashboardOpen && (
          <button className="login-button" onClick={() => openAuth("login")}>Login</button>
        )}
      </nav>

      {/* Side navigation menu. */}
      <div className={`side-menu ${menuOpen ? "open" : ""}`}>
        <button className="close-button" onClick={() => setMenuOpen(false)}>×</button>
        <h2>Omni360</h2>
        <div className="menu-items">
          <button onClick={() => setMenuOpen(false)}>🏠 Home</button>
          <button onClick={() => { setMenuOpen(false); openAuth("login"); }}>📢 Notices</button>
          <button onClick={() => setMenuOpen(false)}>ℹ️ About Omni360</button>
          <button onClick={() => { setMenuOpen(false); openAuth("login"); }}>🎓 Student</button>
          <button onClick={() => { setMenuOpen(false); openAuth("login"); }}>👨‍🏫 Faculty</button>
          <button onClick={() => { setMenuOpen(false); openAuth("login"); }}>🏢 Admin</button>
          <button onClick={() => setMenuOpen(false)}>📞 Contact</button>
        </div>
      </div>
      {menuOpen && <div className="menu-overlay" onClick={() => setMenuOpen(false)} />}

      {/* Unified authentication popup. */}
      {authOpen && (
        <div className="login-overlay">
          <div className="login-card">
            <button className="login-close" onClick={closeAuth}>×</button>
            <div className="login-logo">Omni<span>360</span></div>

            {authMode === "role-select" && (
              <div className="auth-role-select">
                <div className="auth-kicker">SECURE CAMPUS LOGIN</div>
                <h2>Welcome to Omni360</h2>
                <p className="auth-intro">Choose your role to continue. You will then enter the email and password registered with your campus account.</p>

                <div className="role-choice-grid">
                  {[
                    { role: "Student", icon: "🎓", text: "Attendance, timetable, applications, fees and campus services.", action: "Access My Campus" },
                    { role: "Faculty", icon: "👨‍🏫", text: "Manage classes, student requests, attendance, notices and faculty services.", action: "Open Faculty Workspace" },
                    { role: "Admin", icon: "🛡️", text: "Manage users, complaints, applications, finance, notices and operations.", action: "Open Admin Console" },
                  ].map((item) => (
                    <button
                      key={item.role}
                      type="button"
                      className={`role-choice-card role-${item.role.toLowerCase()}`}
                      onClick={() => { setLoginRole(item.role); setAuthMode("login"); setAuthError(""); setAuthMessage(""); }}
                    >
                      <span className="role-choice-icon" aria-hidden="true">{item.icon}</span>
                      <span className="role-choice-copy">
                        <strong>{item.role}</strong>
                        <span>{item.text}</span>
                        <small>{item.action} <span aria-hidden="true">→</span></small>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="auth-help-box">
                  <strong>Which one should I choose?</strong>
                  <span>Students use the student account, teaching staff use Faculty, and authorized campus administrators use Admin.</span>
                </div>
              </div>
            )}

            {authMode === "login" && (
              <>
                <div className="auth-topline">
                  <button className="text-button" type="button" onClick={() => { setAuthMode("role-select"); setAuthError(""); setAuthMessage(""); }}>← Change Role</button>
                  <span className={`role-badge role-badge-${String(loginRole || "user").toLowerCase()}`}>{loginRole || "Campus User"}</span>
                </div>
                <div className="auth-title-row">
                  <div className="auth-selected-icon">{loginRole === "Student" ? "🎓" : loginRole === "Faculty" ? "👨‍🏫" : "🛡️"}</div>
                  <div>
                    <h2>{loginRole} Sign In</h2>
                    <p>Enter your registered {loginRole} email and password.</p>
                  </div>
                </div>
                <form onSubmit={handleUnifiedLogin} className="student-login-form">
                  <div className="form-group">
                    <label>Email Address</label>
                    <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required placeholder={`Enter ${loginRole} email`} />
                  </div>
                  <div className="form-group">
                    <label>Password</label>
                    <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} required placeholder="Enter your password" />
                  </div>
                  {authError && <div className="error-box">{authError}</div>}
                  {authMessage && <div className="success-box">{authMessage}</div>}
                  <button type="submit" disabled={authLoading}>{authLoading ? "Signing in..." : `Sign In as ${loginRole} →`}</button>
                </form>
                <div className="button-row">
                  <button type="button" onClick={() => { setAuthMode("forgot"); setAuthError(""); setAuthMessage(""); }}>Forgot Password</button>
                </div>
              </>
            )}

            {authMode === "activate" && (
              <form onSubmit={handleActivateAccount}>
                <h2>Get Registered</h2>
                <p>Activate your existing campus account.</p>
                <div className="form-group"><label>Email</label><input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required /></div>
                <div className="form-group"><label>New Password</label><input type="password" minLength="8" value={authNewPassword} onChange={(e) => setAuthNewPassword(e.target.value)} required /></div>
                <div className="form-group"><label>Confirm Password</label><input type="password" minLength="8" value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)} required /></div>
                {authError && <div className="error-box">{authError}</div>}
                {authMessage && <div className="success-box">{authMessage}</div>}
                <button disabled={authLoading}>{authLoading ? "Activating..." : "Activate Account"}</button>
                <button type="button" onClick={() => { setAuthMode("role-select"); setLoginRole(""); }}>← Back</button>
              </form>
            )}

            {authMode === "forgot" && (
              <form onSubmit={handleForgotPassword}>
                <h2>Forgot Password</h2>
                <div className="form-group"><label>Email</label><input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} required /></div>
                {authError && <div className="error-box">{authError}</div>}
                {authMessage && <div className="success-box">{authMessage}</div>}
                <button disabled={authLoading}>{authLoading ? "Checking..." : "Request Reset"}</button>
                <button type="button" onClick={() => { setAuthMode("role-select"); setLoginRole(""); }}>← Back</button>
              </form>
            )}

            {authMode === "reset" && (
              <form onSubmit={handleResetPassword}>
                <h2>Reset Password</h2>
                <div className="form-group"><label>Reset Token</label><input value={resetToken} onChange={(e) => setResetToken(e.target.value)} required /></div>
                <div className="form-group"><label>New Password</label><input type="password" minLength="8" value={authNewPassword} onChange={(e) => setAuthNewPassword(e.target.value)} required /></div>
                <div className="form-group"><label>Confirm Password</label><input type="password" minLength="8" value={authConfirmPassword} onChange={(e) => setAuthConfirmPassword(e.target.value)} required /></div>
                {authError && <div className="error-box">{authError}</div>}
                {authMessage && <div className="success-box">{authMessage}</div>}
                <button disabled={authLoading}>{authLoading ? "Resetting..." : "Reset Password"}</button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Student dashboard. All Student module content is rendered inside this dashboard. */}
      {studentDashboardOpen && studentData && (
        <div className="student-dashboard role-dashboard student-role-dashboard">
          <div className="dashboard-top dashboard-top-modern">
            <div>
              <p className="dashboard-welcome">Welcome back 👋</p>
              <h1>Student Dashboard</h1>
              <span className="dashboard-role-badge">STUDENT • CAMPUS LIFE</span>
              <p className="dashboard-subtitle">Everything you need for your campus life.</p>
            </div>
            <button className="dashboard-logout" onClick={handleStudentLogout}>Logout</button>
          </div>

          <div className="student-profile-card animated-card">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
              {studentData.profile_photo ? <img src={fileUrl(studentData.profile_photo)} alt="Student profile" style={{ width: "90px", height: "90px", borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(99,102,241,.22)" }} /> : <div className="profile-icon">🎓</div>}
              <div className="button-row" style={{ justifyContent: "center" }}>
                <label style={{ cursor: "pointer", fontSize: "13px" }}>
                  {profilePhotoUploading === `Student-${studentData.id}` ? "Uploading..." : "📷 Change Photo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0] || null; if (file) setProfilePhotoEditor({ role: "Student", userId: studentData.id, file }); e.target.value = ""; }} />
                </label>
                {studentData.profile_photo && <button type="button" onClick={() => { if (window.confirm("Remove your profile photo?")) handleProfilePhotoDelete("Student", studentData.id); }}>🗑 Remove</button>}
              </div>
            </div>
            <div>
              <h2>{studentData.name}</h2>
              <p>Roll Number: {studentData.roll_number || "N/A"}</p>
              <p>Course: {studentData.course || "N/A"}</p>
              <p>Department: {studentData.department || studentData.course || "N/A"}</p>
              <p>Semester: {studentData.semester || "N/A"}</p>
              <p>Email: {studentData.email || "N/A"}</p>
            </div>
          </div>

          {profilePhotoError && <div className="error-box">{profilePhotoError}</div>}
          {profilePhotoMessage && <div className="success-box">{profilePhotoMessage}</div>}

          {!studentActiveModule ? (
            <div className="student-dashboard-grid" style={{ marginTop: "20px" }}>
              <FeatureCard icon="📚" title="Attendance" text="View your subject-wise attendance." onClick={handleViewAttendance} />
              <FeatureCard icon="📅" title="Timetable" text="Check your complete weekly timetable." onClick={handleViewTimetable} />
              <FeatureCard icon="📝" title="Assignments" text="Track, submit and review assignments." onClick={handleViewAssignments} />
              <FeatureCard icon="📢" title="Notices" text="View important campus notices." onClick={handleViewNotices} />
              <FeatureCard icon="📄" title="Applications" text="Submit and track applications." onClick={handleViewApplications} />
              <FeatureCard icon="🚧" title="Campus Issues" text="Report campus problems." onClick={handleViewCampusIssues} />
              <FeatureCard icon="🏆" title="Certificates" text="Upload, view and download certificates." onClick={handleViewCertificates} />
              <FeatureCard icon="💰" title="Fees" text="Check fees and payments." onClick={handleViewFees} />
              <FeatureCard icon="🏠" title="Hostel / Gate Pass" text="Apply for outings and track status." onClick={handleViewHostel} />
              <FeatureCard icon="🤖" title="Omni360 AI Assistant" text="Ask questions about your own campus records." onClick={handleOpenAI} />
            </div>
          ) : (
                      <div className="student-module-page">
            {studentActiveModule && (
              <div className="module-page-header">
                <div><span className="module-kicker">STUDENT • MODULE</span><h2>{studentActiveModule.charAt(0).toUpperCase() + studentActiveModule.slice(1)}</h2><p>Working with your own campus data.</p></div>
                <button type="button" className="module-back" onClick={() => { closeStudentPanels(); setStudentActiveModule(""); }}>← Dashboard</button>
              </div>
            )}
          {/* Database-aware, read-only Student AI Assistant. */}
          {aiOpen && <div className="dashboard-info-card ai-assistant-card">
            <h2>🤖 Omni360 AI Assistant</h2>
            <p>Ask about your own attendance, timetable, assignments, applications, gate passes, fees, certificates, notices, hostel and campus issues.</p>
            <form onSubmit={handleStudentAI} className="form-group">
              <label>Ask Omni360</label>
              <textarea value={aiQuestion} onChange={(e) => setAiQuestion(e.target.value)} rows="3" placeholder="e.g., How much fee is pending?" />
              <button type="submit" disabled={aiLoading || !aiQuestion.trim()}>{aiLoading ? "Thinking..." : "Ask AI →"}</button>
            </form>
            {aiError && <div className="error-box">{aiError}</div>}
            {aiAnswer && <div className="data-card"><h3>Answer</h3><p style={{ whiteSpace: "pre-wrap" }}>{aiAnswer}</p></div>}
          </div>}

          {/* Student attendance details. */}
          {attendanceOpen && <div className="dashboard-info-card"><h2>📚 Attendance</h2>{attendanceLoading && <p>Loading...</p>}{attendanceError && <div className="error-box">{attendanceError}</div>}{!attendanceLoading && !attendanceError && attendanceData.map((a, i) => <div className="data-card" key={a.id || i}><h3>{a.subject}</h3><p>{a.attended_classes} / {a.total_classes}</p><p>Attendance: {a.percentage ?? (a.total_classes ? ((a.attended_classes / a.total_classes) * 100).toFixed(1) : 0)}%</p></div>)}{!attendanceLoading && !attendanceError && !attendanceData.length && <p>No attendance records found.</p>}</div>}

          {/* Student weekly timetable. */}
          {timetableOpen && <div className="dashboard-info-card"><h2>📅 Weekly Timetable</h2>{timetableLoading && <p>Loading...</p>}{timetableError && <div className="error-box">{timetableError}</div>}{!timetableLoading && !timetableError && timetableData.length > 0 && <div className="timetable-grid">{Object.entries(groupTimetableByDay(timetableData)).map(([day, classes]) => <div className="timetable-day" key={day}><div className="timetable-day-header">{day}</div>{!classes.length ? <p>No classes</p> : classes.map((item, i) => <div className="timetable-class" key={item.id || `${day}-${i}`}><div className="timetable-time">🕘 {item.start_time} - {item.end_time}</div><h3>{item.subject}</h3>{item.course && <p>Course: {item.course}</p>}{item.semester && <p>Semester: {item.semester}</p>}{item.room && <p>🏫 Room: {item.room}</p>}{item.faculty && <p>👨‍🏫 Faculty: {item.faculty}</p>}{item.type && <p>Type: {item.type}</p>}</div>)}</div>)}</div>}{!timetableLoading && !timetableError && !timetableData.length && <p>No timetable records found.</p>}</div>}

          {/* Student assignments with real submit → review workflow. */}
          {assignmentOpen && <div className="dashboard-info-card"><h2>📝 Assignments</h2><p>Faculty publishes the assignment. You submit your completed work here, and Faculty then reviews it.</p>{assignmentLoading && <p>Loading...</p>}{assignmentError && <div className="error-box">{assignmentError}</div>}{!assignmentLoading && !assignmentError && assignmentData.map((a, i) => {
            const status = a.status || "Pending";
            const canSubmit = status === "Pending" || status === "Revision Required";
            const editing = Number(studentAssignmentSubmitId) === Number(a.id);
            return <div className="data-card assignment-student-card" key={a.id || i}>
              <div className="assignment-card-header"><div><h3>{a.title}</h3><p><strong>{a.subject}</strong></p></div><span className={`status-pill ${statusClass(status)}`}>{status}</span></div>
              <p>{a.description}</p><p><strong>Due:</strong> {a.due_date}</p>
              {a.submitted_at && <p><strong>Submitted:</strong> {a.submitted_at}</p>}
              {a.submission_comment && <p><strong>Your note:</strong> {a.submission_comment}</p>}
              {a.submission_path && <p><a href={fileUrl(a.submission_path)} target="_blank" rel="noreferrer">📎 View submitted file</a></p>}
              {a.review_comment && <div className="review-note"><strong>Faculty feedback</strong><p>{a.review_comment}</p>{a.reviewed_at && <small>Reviewed: {a.reviewed_at}</small>}</div>}
              {canSubmit && (editing ? <form className="assignment-submit-panel" onSubmit={handleStudentAssignmentSubmit}>
                <h4>{status === "Revision Required" ? "Resubmit Assignment" : "Submit Completed Assignment"}</h4>
                <div className="form-group"><label>Submission Note</label><textarea value={studentAssignmentComment} onChange={(e) => setStudentAssignmentComment(e.target.value)} placeholder="e.g., I have completed the assignment and attached the file." /></div>
                <div className="form-group"><label>Completed Assignment File</label><input type="file" accept="application/pdf,.doc,.docx,.txt,image/png,image/jpeg" onChange={(e) => setStudentAssignmentFile(e.target.files?.[0] || null)} />{studentAssignmentFile && <small>Selected: {studentAssignmentFile.name}</small>}</div>
                <div className="button-row"><button type="submit" disabled={studentAssignmentSubmitting}>{studentAssignmentSubmitting ? "Submitting..." : "Submit Assignment"}</button><button type="button" onClick={() => { setStudentAssignmentSubmitId(null); setStudentAssignmentComment(""); setStudentAssignmentFile(null); }}>Cancel</button></div>
              </form> : <button type="button" onClick={() => { setStudentAssignmentSubmitId(a.id); setStudentAssignmentComment(a.submission_comment || ""); setStudentAssignmentFile(null); }}>{status === "Revision Required" ? "📤 Resubmit Assignment" : "📤 Submit Completed Work"}</button>)}
            </div>;
          })}{!assignmentLoading && !assignmentError && !assignmentData.length && <p>No assignments found.</p>}</div>}

          {/* Student notices. */}
          {noticeOpen && <div className="dashboard-info-card"><h2>📢 Notices</h2>{noticeLoading && <p>Loading...</p>}{noticeError && <div className="error-box">{noticeError}</div>}{!noticeLoading && !noticeError && noticeData.map((n, i) => <div className="data-card" key={n.id || i}><h3>{n.title}</h3><p>{n.content}</p><small>Date: {n.created_at || "N/A"}</small></div>)}{!noticeLoading && !noticeError && !noticeData.length && <p>No notices found.</p>}</div>}

          {/* Student applications. */}
          {applicationOpen && <div className="dashboard-info-card"><h2>📄 Applications</h2><button type="button" onClick={() => setApplicationFormOpen(!applicationFormOpen)}>{applicationFormOpen ? "Close Form" : "➕ New Application"}</button>{applicationMessage && <div className="success-box">{applicationMessage}</div>}{applicationFormOpen && <form onSubmit={handleSubmitApplication} style={facultyCardStyle}><h3>Submit Application</h3><div className="form-group"><label>Application Type</label><select value={applicationType} onChange={(e) => setApplicationType(e.target.value)}>{["Leave","Medical Leave","Examination Request","Bonafide Certificate","Scholarship","ID Card","Internship Permission","Other"].map(x => <option key={x}>{x}</option>)}</select></div><div className="form-group"><label>Title</label><input value={applicationTitle} onChange={(e) => setApplicationTitle(e.target.value)} required /></div><div className="form-group"><label>Description</label><textarea value={applicationDescription} onChange={(e) => setApplicationDescription(e.target.value)} required /></div><div className="form-group"><label>Start Date</label><input type="date" value={applicationStartDate} onChange={(e) => setApplicationStartDate(e.target.value)} /></div><div className="form-group"><label>End Date</label><input type="date" value={applicationEndDate} onChange={(e) => setApplicationEndDate(e.target.value)} /></div><button disabled={applicationSubmitting}>{applicationSubmitting ? "Submitting..." : "Submit Application"}</button></form>}{applicationError && <div className="error-box">{applicationError}</div>}{applicationLoading && <p>Loading applications...</p>}{!applicationLoading && !applicationError && applicationData.map((a, i) => <div className="data-card" key={a.id || i}><h3>{a.title}</h3><p>Type: {a.application_type}</p><p>{a.description}</p><p>Status: <strong>{a.status}</strong></p><p>Current Approver: {a.current_approver_role || "N/A"}</p></div>)}</div>}

          {/* Student campus complaints. */}
          {campusIssueOpen && <div className="dashboard-info-card"><h2>🚧 Campus Issues / Complaints</h2><button type="button" onClick={() => setCampusIssueFormOpen(!campusIssueFormOpen)}>{campusIssueFormOpen ? "Close Form" : "➕ Report an Issue"}</button>{issueMessage && <div className="success-box">{issueMessage}</div>}{campusIssueFormOpen && <form onSubmit={handleSubmitCampusIssue} style={facultyCardStyle}><h3>Report Campus Issue</h3><div className="form-group"><label>Category</label><select value={issueCategory} onChange={(e) => setIssueCategory(e.target.value)}>{["Cleanliness","Water","Electricity","Classroom","Hostel","Washroom","Computer/Internet","Furniture","Other"].map(x => <option key={x}>{x}</option>)}</select></div><div className="form-group"><label>Description</label><textarea value={issueDescription} onChange={(e) => setIssueDescription(e.target.value)} required /></div><div className="form-group"><label>Location</label><input value={issueLocation} onChange={(e) => setIssueLocation(e.target.value)} required /></div><div className="form-group"><label>📷 Photo (optional)</label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setIssuePhoto(e.target.files?.[0] || null)} />{issuePhoto && <small>Selected: {issuePhoto.name}</small>}</div><button disabled={issueSubmitting}>{issueSubmitting ? "Reporting..." : "Report Issue"}</button></form>}{campusIssueError && <div className="error-box">{campusIssueError}</div>}{campusIssueLoading && <p>Loading campus issues...</p>}{!campusIssueLoading && !campusIssueError && campusIssueData.map((x, i) => <div className="data-card" key={x.id || i}><h3>{x.category}</h3><p>{x.description}</p><p>📍 {x.location}</p>{x.photo_path && <img src={fileUrl(x.photo_path)} alt="Issue proof" style={{ maxWidth: "260px", maxHeight: "180px", objectFit: "cover", borderRadius: "12px", margin: "8px 0" }} />}<p>Status: <strong>{x.status}</strong></p><p>Department: {x.assigned_department || "Not assigned"}</p></div>)}</div>}

          {/* Student certificates. */}
          {certificateOpen && <div className="dashboard-info-card"><h2>🏆 Certificates</h2><button type="button" onClick={() => setCertificateFormOpen(!certificateFormOpen)}>{certificateFormOpen ? "Close Certificate Form" : "➕ Add Certificate"}</button>{certificateMessage && <div className="success-box">{certificateMessage}</div>}{certificateFormOpen && <form onSubmit={handleSubmitCertificate} style={facultyCardStyle}><h3>Add Certificate</h3><div className="form-group"><label>Certificate Type</label><select value={certificateType} onChange={(e) => setCertificateType(e.target.value)}>{["Bonafide Certificate","Character Certificate","Course Certificate","Internship Certificate","Achievement Certificate","Other"].map(x => <option key={x}>{x}</option>)}</select></div><div className="form-group"><label>Certificate Title</label><input value={certificateTitle} onChange={(e) => setCertificateTitle(e.target.value)} required /></div><div className="form-group"><label>Description</label><textarea value={certificateDescription} onChange={(e) => setCertificateDescription(e.target.value)} /></div><div className="form-group"><label>Certificate Date</label><input type="date" value={certificateDate} onChange={(e) => setCertificateDate(e.target.value)} /></div><div className="form-group"><label>📎 Upload Proof</label><input className="file-input" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setCertificateFile(e.target.files?.[0] || null)} /></div>{certificateFile && <small>Selected: {certificateFile.name}</small>}<button disabled={certificateSubmitting}>{certificateSubmitting ? "Uploading..." : "Add Certificate"}</button></form>}{certificateError && <div className="error-box">{certificateError}</div>}{certificateLoading && <p>Loading certificates...</p>}{!certificateLoading && !certificateError && certificateData.map(c => <CertificateCard key={c.id} certificate={c} />)}{!certificateLoading && !certificateError && !certificateData.length && <p>No certificates found.</p>}</div>}

          {/* Student fees. */}
          {feeOpen && <div className="dashboard-info-card"><h2>💰 Fees</h2>{feeLoading && <p>Loading...</p>}{feeError && <div className="error-box">{feeError}</div>}{!feeLoading && !feeError && feeData.some((f) => Number(f.overpaid_amount || 0) > 0) && <div className="success-box"><strong>💳 Fee Credit Available:</strong> ₹{Number(feeData.reduce((sum, f) => sum + Number(f.overpaid_amount || 0), 0)).toFixed(2)}. This amount has been paid in excess and can be considered for adjustment against another semester fee by the administration.</div>}{!feeLoading && !feeError && feeData.map((f, i) => <div className="data-card" key={f.id || i}><h3>{f.semester}</h3><p>Fee Type: {f.fee_type || "Semester Fee"}</p><p>Total: ₹{f.total_amount}</p><p>Paid: ₹{f.paid_amount}</p><p>Pending: ₹{f.pending_amount}</p>{Number(f.overpaid_amount || 0) > 0 && <p>Overpaid / Credit: ₹{f.overpaid_amount}</p>}<p>Status: <strong>{f.status || f.payment_status}</strong></p>{f.due_date && <p>Due Date: {f.due_date}</p>}</div>)}</div>}

          {/* Student hostel and gate pass. */}
          {hostelOpen && <div className="dashboard-info-card"><h2>🏠 Hostel / Gate Pass</h2><p>Apply for an outing or home visit and track your gate pass status.</p><button type="button" onClick={() => setGatePassFormOpen(!gatePassFormOpen)}>{gatePassFormOpen ? "Close Form" : "➕ Apply for Gate Pass"}</button>{gatePassMessage && <div className="success-box">{gatePassMessage}</div>}{gatePassFormOpen && <form onSubmit={handleSubmitGatePass} style={facultyCardStyle}><h3>Apply for Gate Pass</h3><div className="form-group"><label>Reason</label><textarea value={gatePassReason} onChange={(e) => setGatePassReason(e.target.value)} required /></div><div className="form-group"><label>Destination</label><input value={gatePassDestination} onChange={(e) => setGatePassDestination(e.target.value)} required /></div><div className="form-group"><label>Departure Date</label><input type="date" value={gatePassDepartureDate} onChange={(e) => setGatePassDepartureDate(e.target.value)} required /></div><div className="form-group"><label>Departure Time</label><input type="time" value={gatePassDepartureTime} onChange={(e) => setGatePassDepartureTime(e.target.value)} required /></div><div className="form-group"><label>Return Date</label><input type="date" value={gatePassReturnDate} onChange={(e) => setGatePassReturnDate(e.target.value)} required /></div><div className="form-group"><label>Return Time</label><input type="time" value={gatePassReturnTime} onChange={(e) => setGatePassReturnTime(e.target.value)} required /></div><button disabled={gatePassSubmitting}>{gatePassSubmitting ? "Submitting..." : "Submit Gate Pass"}</button></form>}{gatePassError && <div className="error-box">{gatePassError}</div>}{gatePassLoading && <p>Loading...</p>}{!gatePassLoading && !gatePassError && gatePassData.map(p => <div className="data-card" key={p.id}><h3>🪪 Gate Pass #{p.id}</h3><p>Reason: {p.reason}</p><p>Destination: {p.destination}</p><p>Departure: {p.departure_date} {p.departure_time}</p><p>Return: {p.return_date} {p.return_time}</p><p>Status: <strong>{p.status}</strong></p><p>Current Approval Stage: <strong>{p.current_approver_role || "Completed"}</strong></p>{p.faculty_approved_by_name && <p>✅ Faculty Approved By: {p.faculty_approved_by_name} · {p.faculty_approved_at}</p>}{p.warden_approved_by_name && <p>🏠 Warden Approved By: {p.warden_approved_by_name} · {p.warden_approved_at}</p>}{p.pass_code && <p>🎟️ Digital Pass Code: <strong>{p.pass_code}</strong></p>}</div>)}</div>}
          </div>

          )}
        </div>
      )}

      {/* Faculty dashboard. */}
      {facultyDashboardOpen && facultyData && (
        <div className="student-dashboard role-dashboard faculty-role-dashboard">
          <div className="dashboard-top dashboard-top-modern"><div><p className="dashboard-welcome">Welcome back 👋</p><h1>Faculty Dashboard</h1><span className="dashboard-role-badge">FACULTY • ACADEMIC WORKSPACE</span><p className="dashboard-subtitle">{facultyData.name} • {facultyData.department}</p></div><button className="dashboard-logout" onClick={handleFacultyLogout}>Logout</button></div>
          <div className="student-profile-card animated-card">
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
              {facultyData.profile_photo ? (
                <img src={fileUrl(facultyData.profile_photo)} alt="Faculty profile" style={{ width: "90px", height: "90px", borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(99,102,241,.22)" }} />
              ) : <div className="profile-icon">👨‍🏫</div>}
              <div className="button-row" style={{ justifyContent: "center" }}>
                <label style={{ cursor: "pointer", fontSize: "13px" }}>
                  {profilePhotoUploading === `Faculty-${facultyData.id}` ? "Uploading..." : "📷 Change Photo"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0] || null; if (file) { setProfilePhotoEditor({ role: "Faculty", userId: facultyData.id, file }); } e.target.value = ""; }} />
                </label>
                {facultyData.profile_photo && <button type="button" onClick={() => { if (window.confirm("Remove your profile photo?")) handleProfilePhotoDelete("Faculty", facultyData.id); }}>🗑 Remove</button>}
              </div>
            </div>
            <div><h2>{facultyData.name}</h2><p>Employee ID: {facultyData.employee_id}</p><p>Department: {facultyData.department}</p><p>Designation: {facultyData.designation}</p><p>Hostel Role: {facultyData.hostel_role || "Faculty"}</p><p>Email: {facultyData.email}</p></div>
          </div>
          {profilePhotoError && <div className="error-box">{profilePhotoError}</div>}
          {profilePhotoMessage && <div className="success-box">{profilePhotoMessage}</div>}

          {/* Faculty navigation tabs are preserved. */}
          <div className="dashboard-nav">{[["home","🏠 Dashboard"],["profile","👤 Profile"],["students","🎓 Students"],["attendance","📊 Attendance"],["timetable","📅 Timetable"],["assignments","📝 Assignments"],["applications","📄 Applications"],["gatepasses","🚪 Gate Pass"],["notices","📢 Notices"],["certificates","🎓 Certificates"],["complaints","⚠️ Complaints"],["pending","🔔 Pending Actions"]].map(([key,label]) => <button key={key} type="button" onClick={() => openFacultySection(key)}>{label}</button>)}</div>
          {facultyMessage && <div className="success-box">{facultyMessage}</div>}
          {facultyError && <div className="error-box">{facultyError}</div>}

          {/* Faculty home. */}
          {facultySection === "home" && <div><h2>Faculty Control Center</h2><p>Manage academic activities, student requests and permitted student information.</p><div className="student-dashboard-grid"><FeatureCard icon="📊" title="Attendance" text="Update student attendance." onClick={() => openFacultySection("attendance")} /><FeatureCard icon="📅" title="Timetable" text="Create class timetable entries." onClick={() => openFacultySection("timetable")} /><FeatureCard icon="🎓" title="Students" text="Browse students by department and semester." onClick={() => openFacultySection("students")} /><FeatureCard icon="📝" title="Assignments" text="Create assignments." onClick={() => openFacultySection("assignments")} /><FeatureCard icon="📄" title="Applications" text="Review student applications and submit your own requests to Admin." onClick={() => openFacultySection("applications")} /><FeatureCard icon="🚪" title="Gate Pass" text="Approve or reject gate passes." onClick={() => openFacultySection("gatepasses")} /><FeatureCard icon="📢" title="Notices" text="Publish campus notices." onClick={() => openFacultySection("notices")} /><FeatureCard icon="🎓" title="Certificates" text="Issue certificates to students." onClick={() => openFacultySection("certificates")} /><FeatureCard icon="⚠️" title="Complaints" text="Submit faculty grievances and view complaint status." onClick={() => openFacultySection("complaints")} /><FeatureCard icon="🔔" title="Pending Actions" text="View requests waiting for action." onClick={() => openFacultySection("pending")} /></div></div>}

          {/* Faculty profile. */}
          {facultySection === "profile" && <div style={facultyCardStyle}><h2>👤 Faculty Profile</h2>{facultyLoading ? <p>Loading...</p> : <><p><strong>Name:</strong> {facultyData.name}</p><p><strong>Employee ID:</strong> {facultyData.employee_id}</p><p><strong>Department:</strong> {facultyData.department}</p><p><strong>Designation:</strong> {facultyData.designation}</p><p><strong>Email:</strong> {facultyData.email}</p></>}</div>}

          {/* Faculty student directory. */}
          {facultySection === "students" && <div style={facultyCardStyle}><h2>🎓 Student Academic Directory</h2><p>Browse students in a structured Department → Semester hierarchy.</p>{facultyStudentsLoading && <p>Loading students...</p>}{facultyStudentsError && <div className="error-box">{facultyStudentsError}</div>}<div className="directory-controls"><div className="form-group"><label>Department</label><select value={selectedDepartment} onChange={(e) => { setSelectedDepartment(e.target.value); setSelectedSemester(""); }}><option value="">All Departments</option>{facultyDepartments.map(d => <option key={d}>{d}</option>)}</select></div><div className="form-group"><label>Semester</label><select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)}><option value="">All Semesters</option>{facultySemesters.map(s => <option key={s} value={s}>{s}</option>)}</select></div></div><div style={{ display: "grid", gap: "14px", marginTop: "16px" }}>{Object.entries(filteredFacultyStudents.reduce((acc, student) => { const dept = student.department || student.course || "Unassigned Department"; const sem = student.semester || "Unknown Semester"; if (!acc[dept]) acc[dept] = {}; if (!acc[dept][sem]) acc[dept][sem] = []; acc[dept][sem].push(student); return acc; }, {})).map(([dept, semesters]) => <details key={dept} open style={{ border: "1px solid rgba(99,102,241,.14)", borderRadius: "16px", padding: "14px" }}><summary style={{ cursor: "pointer", fontWeight: 800 }}>🏫 {dept}</summary><div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>{Object.entries(semesters).map(([sem, students]) => <details key={sem} open><summary style={{ cursor: "pointer", fontWeight: 700 }}>📚 {sem} · {students.length} Students</summary><div className="student-directory-grid" style={{ marginTop: "10px" }}>{students.map(student => <div className="data-card student-directory-card" key={student.id}>{student.profile_photo ? <img src={fileUrl(student.profile_photo)} alt="Student" style={{ width: "58px", height: "58px", borderRadius: "50%", objectFit: "cover", float: "right" }} /> : null}<h3>{student.name}</h3><p>Roll Number: {student.roll_number}</p><p>Department: {student.department || student.course || "N/A"}</p><p>Semester: {student.semester || "N/A"}</p><p>Course: {student.course || "N/A"}</p><p>Department Student No.: {student.department_student_number || "N/A"}</p><button type="button" className="profile-view-button" onClick={() => handleViewStudentProfile(student)}>👁 View Full Profile</button></div>)}</div></details>)}</div></details>)}</div>{!facultyStudentsLoading && !filteredFacultyStudents.length && <p>No students found for the selected filters.</p>}</div>}

          {/* Faculty read-only student profile. */}
          {studentProfileOpen && selectedStudent && <div className="profile-modal-overlay"><div className="profile-modal student-full-profile"><button onClick={closeStudentProfile} className="profile-modal-close" aria-label="Close profile">×</button><div className="profile-modal-header"><div><span className="module-kicker">FACULTY • READ ONLY</span><h2>🎓 Student Academic Profile</h2><p>Complete profile for <strong>{selectedStudent.name}</strong>. All sections below belong only to the Student you selected.</p></div>{selectedStudent.profile_photo ? <img src={fileUrl(selectedStudent.profile_photo)} alt={`${selectedStudent.name} profile`} className="full-profile-photo" /> : <div className="full-profile-avatar">🎓</div>}</div><span className="readonly-badge">READ ONLY • FACULTY VIEW</span>

            <div className="full-profile-grid">
              <div className="data-card full-profile-section"><h3>👤 Personal & Academic Information</h3><div className="profile-detail-grid"><p><strong>Name</strong><span>{selectedStudent.name || "N/A"}</span></p><p><strong>Roll Number</strong><span>{selectedStudent.roll_number || "N/A"}</span></p><p><strong>Global Student ID</strong><span>{selectedStudent.id}</span></p><p><strong>Department Student No.</strong><span>{selectedStudent.department_student_number || "N/A"}</span></p><p><strong>Department</strong><span>{selectedStudent.department || "N/A"}</span></p><p><strong>Course</strong><span>{selectedStudent.course || "N/A"}</span></p><p><strong>Semester</strong><span>{selectedStudent.semester || "N/A"}</span></p><p><strong>Email</strong><span>{selectedStudent.email || "N/A"}</span></p></div></div>

              <div className="data-card full-profile-section"><h3>📊 Attendance</h3>{!selectedStudentAcademic ? <p>Loading attendance...</p> : !selectedStudentAcademic.attendance.length ? <p>No attendance records available.</p> : <div className="profile-list">{selectedStudentAcademic.attendance.map((r) => <div className="profile-list-row" key={r.id || `${r.subject}-${r.attended_classes}`}><span><strong>{r.subject}</strong><small>{r.attended_classes} / {r.total_classes} classes</small></span><strong>{r.percentage ?? 0}%</strong></div>)}</div>}</div>

              <div className="data-card full-profile-section"><h3>📅 Timetable</h3>{!selectedStudentAcademic ? <p>Loading timetable...</p> : !selectedStudentAcademic.timetable.length ? <p>No timetable records available.</p> : <div className="profile-list">{selectedStudentAcademic.timetable.map((r, i) => <div className="profile-list-row" key={r.id || i}><span><strong>{r.day || "Day not set"} • {r.subject || "Subject"}</strong><small>{r.start_time || ""} - {r.end_time || ""}{r.room ? ` · Room ${r.room}` : ""}</small></span><small>{r.faculty || "Faculty not recorded"}</small></div>)}</div>}</div>

              <div className="data-card full-profile-section"><h3>📝 Assignments</h3>{!selectedStudentAcademic ? <p>Loading assignments...</p> : !selectedStudentAcademic.assignments.length ? <p>No assignment records available.</p> : <div className="profile-list">{selectedStudentAcademic.assignments.map((r) => <div className="profile-list-row" key={r.id}><span><strong>{r.title || "Assignment"}</strong><small>{r.subject || "Subject"} · Due {r.due_date || "N/A"}</small></span><span className={`status-pill ${statusClass(r.status)}`}>{r.status || "Pending"}</span></div>)}</div>}</div>

              <div className="data-card full-profile-section"><h3>📄 Applications</h3>{!selectedStudentAcademic ? <p>Loading applications...</p> : !selectedStudentAcademic.applications.length ? <p>No applications submitted.</p> : <div className="profile-list">{selectedStudentAcademic.applications.map((r) => <div className="profile-list-row" key={r.id}><span><strong>{r.title || "Application"}</strong><small>{r.application_type || "Request"} · {r.start_date || ""}{r.end_date ? ` → ${r.end_date}` : ""}</small></span><span className={`status-pill ${statusClass(r.status)}`}>{r.status || "Pending"}</span></div>)}</div>}</div>

              <div className="data-card full-profile-section"><h3>🚧 Campus Issues</h3>{!selectedStudentAcademic ? <p>Loading campus issues...</p> : !selectedStudentAcademic.campusIssues.length ? <p>No campus issues reported.</p> : <div className="profile-list">{selectedStudentAcademic.campusIssues.map((r) => <div className="profile-list-row" key={r.id}><span><strong>{r.category || "Issue"}</strong><small>{r.description || "No description"} · {r.location || "Location not recorded"}</small></span><span className={`status-pill ${statusClass(r.status)}`}>{r.status || "Pending"}</span></div>)}</div>}</div>

              <div className="data-card full-profile-section"><h3>🏆 Certificates & Achievements</h3>{!selectedStudentAcademic ? <p>Loading certificates...</p> : !selectedStudentAcademic.certificates.length ? <p>No certificate or achievement records found.</p> : <div className="profile-certificate-grid">{selectedStudentAcademic.certificates.map((certificate) => <CertificateCard key={certificate.id} certificate={certificate} />)}</div>}</div>

              <div className="data-card full-profile-section"><h3>💳 Fees</h3>{!selectedStudentAcademic ? <p>Loading fees...</p> : !selectedStudentAcademic.fees.length ? <p>No fee records available.</p> : <div className="profile-list">{selectedStudentAcademic.fees.map((r) => <div className="profile-list-row" key={r.id}><span><strong>{r.semester || "Semester"} · {r.fee_type || "Fee"}</strong><small>Paid ₹{r.paid_amount ?? 0} · Pending ₹{r.pending_amount ?? 0}{Number(r.overpaid_amount || 0) > 0 ? ` · Credit ₹${r.overpaid_amount}` : ""}</small></span><span className={`status-pill ${statusClass(r.status)}`}>{r.status || "Pending"}</span></div>)}</div>}</div>

              <div className="data-card full-profile-section"><h3>🚪 Gate Pass History</h3>{!selectedStudentAcademic ? <p>Loading gate-pass history...</p> : !selectedStudentAcademic.gatePasses.length ? <p>No gate-pass records available.</p> : <div className="profile-list">{selectedStudentAcademic.gatePasses.map((r) => <div className="profile-list-row" key={r.id}><span><strong>Gate Pass #{r.id}</strong><small>{r.destination || "Destination not recorded"} · {r.departure_date || ""} {r.departure_time || ""}</small></span><span className={`status-pill ${statusClass(r.status)}`}>{r.status || "Pending"}</span></div>)}</div>}</div>
            </div>

            <div className="profile-modal-footer"><button type="button" onClick={closeStudentProfile}>Close Student Profile</button></div>
          </div></div>}

          {/* Faculty attendance. */}
          {facultySection === "attendance" && <div><div style={facultyCardStyle}><h2>📊 Update Attendance</h2><form onSubmit={handleFacultyAttendanceSubmit}><div className="form-group"><label>Student</label><select value={attendanceStudentId} onChange={(e) => setAttendanceStudentId(e.target.value)} required><option value="">Select Student</option>{facultyStudents.map(s => <option key={s.id} value={s.id}>{s.name} — {s.roll_number}</option>)}</select></div><div className="form-group"><label>Subject</label><input value={attendanceSubject} onChange={(e) => setAttendanceSubject(e.target.value)} required /></div><div className="form-group"><label>Attended Classes</label><input type="number" min="0" value={attendanceAttended} onChange={(e) => setAttendanceAttended(e.target.value)} required /></div><div className="form-group"><label>Total Classes</label><input type="number" min="1" value={attendanceTotal} onChange={(e) => setAttendanceTotal(e.target.value)} required /></div><button disabled={attendanceSubmitting}>{attendanceSubmitting ? "Updating..." : "Update Attendance"}</button></form>{facultyAttendanceError && <div className="error-box">{facultyAttendanceError}</div>}</div><div style={facultyCardStyle}><h2>Existing Attendance</h2>{facultyAttendanceLoading && <p>Loading...</p>}{facultyAttendance.map((r,i) => <div className="data-card" key={r.id || i}><h3>{r.subject}</h3><p>Student ID: {r.student_id}</p><p>{r.attended_classes} / {r.total_classes}</p><p>Percentage: {r.percentage ?? (r.total_classes ? ((r.attended_classes/r.total_classes)*100).toFixed(1) : 0)}%</p></div>)}</div></div>}

          {/* Faculty timetable. */}
          {facultySection === "timetable" && <div><div style={facultyCardStyle}><h2>📅 Create Timetable</h2><form onSubmit={handleFacultyTimetableSubmit}><div className="form-group"><label>Course</label><input value={timetableCourse} onChange={(e) => setTimetableCourse(e.target.value)} required /></div><div className="form-group"><label>Semester</label><input value={timetableSemester} onChange={(e) => setTimetableSemester(e.target.value)} required /></div><div className="form-group"><label>Day</label><select value={timetableDay} onChange={(e) => setTimetableDay(e.target.value)}>{["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map(d => <option key={d}>{d}</option>)}</select></div><div className="form-group"><label>Subject</label><input value={timetableSubject} onChange={(e) => setTimetableSubject(e.target.value)} required /></div><div className="form-group"><label>Start Time</label><input type="time" value={timetableStartTime} onChange={(e) => setTimetableStartTime(e.target.value)} required /></div><div className="form-group"><label>End Time</label><input type="time" value={timetableEndTime} onChange={(e) => setTimetableEndTime(e.target.value)} required /></div><div className="form-group"><label>Room</label><input value={timetableRoom} onChange={(e) => setTimetableRoom(e.target.value)} required /></div><button disabled={timetableSubmitting}>{timetableSubmitting ? "Creating..." : "Create Timetable"}</button></form>{facultyTimetableError && <div className="error-box">{facultyTimetableError}</div>}</div><div style={facultyCardStyle}><h2>Existing Weekly Timetable</h2>{facultyTimetableLoading && <p>Loading...</p>}{!facultyTimetableLoading && facultyTimetable.length > 0 && <div className="timetable-grid">{Object.entries(groupTimetableByDay(facultyTimetable)).map(([day,classes]) => <div className="timetable-day" key={day}><div className="timetable-day-header">{day}</div>{!classes.length ? <p>No classes</p> : classes.map((item,i) => <div className="timetable-class" key={item.id || `${day}-${i}`}><div className="timetable-time">🕘 {item.start_time} - {item.end_time}</div><h3>{item.subject}</h3>{item.course && <p>Course: {item.course}</p>}{item.semester && <p>Semester: {item.semester}</p>}{item.room && <p>🏫 Room: {item.room}</p>}{item.faculty && <p>👨‍🏫 Faculty: {item.faculty}</p>}</div>)}</div>)}</div>}{!facultyTimetableLoading && !facultyTimetable.length && <p>No timetable records found.</p>}</div></div>}

          {/* Faculty assignments: create + review Student submissions. */}
          {facultySection === "assignments" && <div>
            <div style={facultyCardStyle}>
              <h2>📝 Create Assignment</h2>
              <p>Choose a course and semester. The assignment will be created for every registered student in that group.</p>
              <form onSubmit={handleFacultyAssignmentSubmit}>
                <div className="form-group"><label>Course</label><input value={facultyAssignmentCourse} onChange={(e) => setFacultyAssignmentCourse(e.target.value)} placeholder="e.g., MCA" required /></div>
                <div className="form-group"><label>Semester</label><input value={facultyAssignmentSemester} onChange={(e) => setFacultyAssignmentSemester(e.target.value)} placeholder="e.g., 1st Semester" required /></div>
                <div className="form-group"><label>Subject</label><input value={facultyAssignmentSubject} onChange={(e) => setFacultyAssignmentSubject(e.target.value)} placeholder="e.g., Database Management Systems" required /></div>
                <div className="form-group"><label>Title</label><input value={facultyAssignmentTitle} onChange={(e) => setFacultyAssignmentTitle(e.target.value)} placeholder="e.g., ER Diagram Assignment" required /></div>
                <div className="form-group"><label>Description</label><textarea value={facultyAssignmentDescription} onChange={(e) => setFacultyAssignmentDescription(e.target.value)} placeholder="Explain the task, expected work and what students should submit." required /></div>
                <div className="form-group"><label>Due Date</label><input type="date" value={facultyAssignmentDueDate} onChange={(e) => setFacultyAssignmentDueDate(e.target.value)} required /></div>
                <button disabled={facultyAssignmentSubmitting}>{facultyAssignmentSubmitting ? "Creating..." : "Create Assignment"}</button>
              </form>
              {facultyAssignmentsError && <div className="error-box">{facultyAssignmentsError}</div>}
            </div>

            <div style={facultyCardStyle}>
              <div className="section-heading-row"><div><h2>📚 Assignment Review Center</h2><p>Pending means the Student has not submitted. After submission you can use Under Review, Revision Required or Completed.</p></div><button type="button" onClick={() => openFacultySection("assignments")} disabled={facultyAssignmentsLoading}>↻ Refresh</button></div>
              {facultyAssignmentsLoading && <p>Loading assignments...</p>}
              {!facultyAssignmentsLoading && !facultyAssignments.length && <p>No assignments found.</p>}
              {facultyAssignments.map((a) => {
                const draft = facultyAssignmentReviewDrafts[a.id] || { status: a.status || "Pending", comment: a.review_comment || "" };
                const hasSubmission = Boolean(a.submission_path || a.submission_comment || a.submitted_at);
                return <div className="data-card assignment-review-card" key={a.id}>
                  <div className="assignment-card-header"><div><h3>{a.title}</h3><p><strong>{a.student_name || `Student ${a.student_id}`}</strong> · {a.roll_number || ""} · {a.course || ""} · {a.semester || ""}</p></div><span className={`status-pill ${statusClass(a.status)}`}>{a.status || "Pending"}</span></div>
                  <p><strong>Subject:</strong> {a.subject}</p><p>{a.description}</p><p><strong>Due:</strong> {a.due_date}</p>
                  <div className="submission-record"><h4>Student Submission</h4>{!hasSubmission ? <p>⏳ No submission yet. The Student must submit completed work from their Assignments page.</p> : <><p><strong>Submitted:</strong> {a.submitted_at || "Time not recorded"}</p>{a.submission_comment && <p><strong>Student note:</strong> {a.submission_comment}</p>}{a.submission_path && <p><a href={fileUrl(a.submission_path)} target="_blank" rel="noreferrer">📎 Open submitted file</a></p>}</>}</div>
                  {a.review_comment && <div className="review-note"><strong>Faculty Feedback</strong><p>{a.review_comment}</p>{a.reviewed_at && <small>Reviewed: {a.reviewed_at}</small>}</div>}
                  <div className="assignment-review-controls">
                    <div className="form-group"><label>Academic Status</label><select value={draft.status} onChange={(e) => setFacultyAssignmentReviewDrafts((current) => ({ ...current, [a.id]: { ...draft, status: e.target.value } }))}><option>Pending</option><option>Submitted</option><option>Under Review</option><option>Revision Required</option><option>Completed</option></select></div>
                    <div className="form-group"><label>Feedback / Review Comment</label><textarea value={draft.comment || ""} onChange={(e) => setFacultyAssignmentReviewDrafts((current) => ({ ...current, [a.id]: { ...draft, comment: e.target.value } }))} placeholder="e.g., Good work. Please correct question 4." /></div>
                  </div>
                  <button type="button" disabled={facultyAssignmentReviewingId === a.id || !hasSubmission} onClick={() => handleFacultyAssignmentReview(a.id)}>{facultyAssignmentReviewingId === a.id ? "Saving..." : hasSubmission ? "💾 Update Assignment Status" : "Waiting for Student Submission"}</button>
                </div>;
              })}
            </div>
          </div>}

          {/* Faculty applications. */}
          {facultySection === "applications" && <div>
            <div style={facultyCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <div><h2>📄 Student Applications</h2><p>Review requests submitted by students.</p></div>
                <button type="button" onClick={() => openFacultySection("applications")}>↻ Refresh</button>
              </div>
              {facultyApplicationsError && <div className="error-box">{facultyApplicationsError}</div>}
              {facultyApplicationsLoading && <p>Loading student applications...</p>}
              {!facultyApplicationsLoading && !facultyApplications.length && <p>No student applications are currently waiting for Faculty action.</p>}
              {facultyApplications.map(a => <div className="data-card" key={a.id}><h3>{a.title}</h3><p><strong>Student:</strong> {a.student_name || a.applicant_id} {a.roll_number ? `(${a.roll_number})` : ""}</p><p>Type: {a.application_type}</p><p>{a.description}</p><p>Status: <strong>{a.status}</strong></p><p>Current Approver: {a.current_approver_role || "None"}</p>{a.status === "Pending" && a.current_approver_role === "Faculty" && <div className="button-row"><button disabled={processingApplicationId === a.id} onClick={() => handleApproveApplication(a.id)}>{processingApplicationId === a.id ? "Processing..." : "✅ Approve"}</button><button disabled={processingApplicationId === a.id} onClick={() => handleRejectApplication(a.id)}>❌ Reject</button></div>}</div>)}
            </div>

            <div style={facultyCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <div><h2>📝 My Applications</h2><p>Applications you submit as Faculty go to Admin / the designated authority.</p></div>
                <button type="button" onClick={() => setFacultyApplicationFormOpen(!facultyApplicationFormOpen)}>{facultyApplicationFormOpen ? "Close Form" : "➕ New Faculty Application"}</button>
              </div>
              {facultyApplicationMessage && <div className="success-box">{facultyApplicationMessage}</div>}
              {facultyMyApplicationsError && <div className="error-box">{facultyMyApplicationsError}</div>}
              {facultyApplicationFormOpen && <form onSubmit={handleFacultyApplicationSubmit} style={facultyCardStyle}>
                <div className="form-group"><label>Application Type</label><select value={facultyApplicationType} onChange={(e) => setFacultyApplicationType(e.target.value)}>{["Leave","Medical Leave","Permission","On Duty","Salary / Finance","Other"].map(x => <option key={x}>{x}</option>)}</select></div>
                <div className="form-group"><label>Title</label><input value={facultyApplicationTitle} onChange={(e) => setFacultyApplicationTitle(e.target.value)} required /></div>
                <div className="form-group"><label>Description</label><textarea value={facultyApplicationDescription} onChange={(e) => setFacultyApplicationDescription(e.target.value)} required /></div>
                <div className="form-group"><label>Start Date</label><input type="date" value={facultyApplicationStartDate} onChange={(e) => setFacultyApplicationStartDate(e.target.value)} /></div>
                <div className="form-group"><label>End Date</label><input type="date" value={facultyApplicationEndDate} onChange={(e) => setFacultyApplicationEndDate(e.target.value)} /></div>
                <button disabled={facultyApplicationSubmitting}>{facultyApplicationSubmitting ? "Submitting..." : "Submit to Admin"}</button>
              </form>}
              {facultyMyApplicationsLoading && <p>Loading your applications...</p>}
              {!facultyMyApplicationsLoading && facultyMyApplications.map(a => <div className="data-card" key={a.id}><h3>{a.title}</h3><p>Type: {a.application_type}</p><p>{a.description}</p><p>{a.start_date || ""}{a.end_date ? ` → ${a.end_date}` : ""}</p><p>Status: <strong>{a.status}</strong></p><p>Current Approver: {a.current_approver_role || "None"}</p></div>)}
              {!facultyMyApplicationsLoading && !facultyMyApplications.length && <p>No Faculty applications submitted yet.</p>}
            </div>
          </div>}

          {/* Faculty gate passes. */}
          {facultySection === "gatepasses" && <div style={facultyCardStyle}>
            <h2>🚪 Gate Pass Approval</h2>
            <p>Hostel outing requests follow <strong>Faculty review → Warden / Assistant Warden final approval</strong>.</p>
            <div className="success-box" style={{ marginBottom: "14px" }}>
              Faculty approval records the teacher's name and time. The request then moves to the Warden stage. Only the final Warden/Assistant Warden approval generates the digital pass code.
            </div>
            {facultyGatePassesLoading && <p>Loading gate-pass requests...</p>}
            {facultyGatePassesError && <div className="error-box">{facultyGatePassesError}</div>}
            {!facultyGatePassesLoading && !facultyGatePasses.length && <p>No gate-pass requests are waiting for your role.</p>}
            {facultyGatePasses.map((p) => {
              const normalizedHostelRole = String(facultyData.hostel_role || "").toLowerCase();
              const isWarden = normalizedHostelRole === "warden" || normalizedHostelRole === "assistant warden" || normalizedHostelRole.includes("warden");
              const canAct = p.current_approver_role === "Faculty" || (p.current_approver_role === "Warden" && isWarden);

              return <div className="data-card" key={p.id}>
                <h3>🪪 Gate Pass #{p.id} — {p.student_name || `Student ${p.student_id}`}</h3>
                <p><strong>Roll:</strong> {p.roll_number || "N/A"} · <strong>Student ID:</strong> {p.student_id}</p>
                <p><strong>Reason:</strong> {p.reason}</p>
                <p><strong>Destination:</strong> {p.destination}</p>
                <p><strong>Departure:</strong> {p.departure_date} {p.departure_time}</p>
                <p><strong>Return:</strong> {p.return_date} {p.return_time}</p>
                <p><strong>Status:</strong> {p.status}</p>
                <p><strong>Current approval stage:</strong> {p.current_approver_role || "Completed"}</p>
                <div style={{ marginTop: "12px", padding: "14px", borderRadius: "14px", background: "rgba(15,23,42,.04)" }}>
                  <h3 style={{ marginTop: 0 }}>Approval History</h3>
                  <p>✅ <strong>Faculty:</strong> {p.faculty_approved_by_name ? `${p.faculty_approved_by_name} · ${p.faculty_approved_at || "time unavailable"}` : "Awaiting Faculty approval"}</p>
                  <p>🏠 <strong>Warden:</strong> {p.warden_approved_by_name ? `${p.warden_approved_by_name} · ${p.warden_approved_at || "time unavailable"}` : "Awaiting Warden / Assistant Warden approval"}</p>
                </div>
                {canAct && <div className="button-row" style={{ marginTop: "12px" }}>
                  <button disabled={processingGatePassId === p.id} onClick={() => handleApproveGatePass(p)}>{processingGatePassId === p.id ? "Processing..." : p.current_approver_role === "Warden" ? "🏠 Final Approve" : "✅ Approve & Send to Warden"}</button>
                  <button disabled={processingGatePassId === p.id} onClick={() => handleRejectGatePass(p)}>❌ Reject</button>
                </div>}
              </div>;
            })}
          </div>}

          {/* Faculty notices. */}
          {facultySection === "notices" && <div style={facultyCardStyle}><h2>📢 Create Campus Notice</h2><form onSubmit={handleFacultyNoticeSubmit}><div className="form-group"><label>Title</label><input value={facultyNoticeTitle} onChange={(e) => setFacultyNoticeTitle(e.target.value)} required /></div><div className="form-group"><label>Content</label><textarea value={facultyNoticeContent} onChange={(e) => setFacultyNoticeContent(e.target.value)} required /></div><div className="form-group"><label>Target</label><select value={facultyNoticeTargetType} onChange={(e) => setFacultyNoticeTargetType(e.target.value)}><option>All</option><option>Course</option><option>Semester</option></select></div>{facultyNoticeTargetType !== "All" && <div className="form-group"><label>Target Value</label><input value={facultyNoticeTargetValue} onChange={(e) => setFacultyNoticeTargetValue(e.target.value)} required /></div>}<button disabled={facultyNoticeSubmitting}>{facultyNoticeSubmitting ? "Publishing..." : "Publish Notice"}</button></form></div>}

          {/* Faculty certificate issuing: only the selected student's certificates are shown. */}
          {facultySection === "certificates" && <div style={facultyCardStyle}>
            <h2>🎓 Issue Certificate</h2>
            <p>Select the exact Student first. The certificate records shown below are loaded only for that selected Student.</p>

            <div className="certificate-student-picker">
              <div className="picker-step"><span className="picker-step-number">1</span><div className="form-group"><label>Department</label><select value={facultyCertificateDepartment} onChange={(e) => { setFacultyCertificateDepartment(e.target.value); setFacultyCertificateSemester(""); setFacultyCertificateStudentId(""); setFacultyStudentCertificates([]); }} required><option value="">Select Department</option>{facultyCertificateDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</select></div></div>
              <div className="picker-step"><span className="picker-step-number">2</span><div className="form-group"><label>Semester</label><select value={facultyCertificateSemester} onChange={(e) => { setFacultyCertificateSemester(e.target.value); setFacultyCertificateStudentId(""); setFacultyStudentCertificates([]); }} disabled={!facultyCertificateDepartment} required><option value="">{facultyCertificateDepartment ? "Select Semester" : "Select Department First"}</option>{facultyCertificateSemesters.map((semester) => <option key={semester} value={semester}>{semester}</option>)}</select></div></div>
              <div className="picker-step"><span className="picker-step-number">3</span><div className="form-group"><label>Student</label><select value={facultyCertificateStudentId} onChange={(e) => handleFacultyCertificateStudentChange(e.target.value)} disabled={!facultyCertificateSemester} required><option value="">{facultyCertificateSemester ? "Select Student" : "Select Semester First"}</option>{facultyCertificateStudents.map((student) => <option key={student.id} value={student.id}>{student.name} — {student.roll_number} · Student No. {student.department_student_number || student.id}</option>)}</select></div></div>
            </div>

            {selectedFacultyCertificateStudent && <div className="selected-student-preview"><div className="selected-student-avatar">🎓</div><div><span>SELECTED STUDENT</span><strong>{selectedFacultyCertificateStudent.name}</strong><p>{selectedFacultyCertificateStudent.roll_number} · {selectedFacultyCertificateStudent.department || selectedFacultyCertificateStudent.course} · {selectedFacultyCertificateStudent.semester}</p></div></div>}

            <form onSubmit={handleFacultyCertificateSubmit}>
              <div className="form-group"><label>Certificate Type</label><select value={facultyCertificateType} onChange={(e) => setFacultyCertificateType(e.target.value)}>{["Bonafide Certificate","Character Certificate","Course Certificate","Internship Certificate","Achievement Certificate","Other"].map(x => <option key={x}>{x}</option>)}</select></div>
              <div className="form-group"><label>Certificate Title</label><input value={facultyCertificateTitle} onChange={(e) => setFacultyCertificateTitle(e.target.value)} placeholder="e.g., Internship Completion Certificate" required /></div>
              <div className="form-group"><label>Certificate Date</label><input type="date" value={facultyCertificateDate} onChange={(e) => setFacultyCertificateDate(e.target.value)} /></div>
              <div className="form-group"><label>📎 Proof File (optional)</label><input className="file-input" type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setFacultyCertificateFile(e.target.files?.[0] || null)} />{facultyCertificateFile && <small>Selected: {facultyCertificateFile.name}</small>}</div>
              <button disabled={facultyCertificateSubmitting || !facultyCertificateStudentId}>{facultyCertificateSubmitting ? "Issuing..." : "Issue Certificate"}</button>
            </form>

            <div className="selected-student-certificates"><h3>📚 Certificates for Selected Student</h3>{!selectedFacultyCertificateStudent && <p>Select a Department → Semester → Student above to see that student's certificates.</p>}{selectedFacultyCertificateStudent && facultyStudentCertificatesLoading && <p>Loading certificates for {selectedFacultyCertificateStudent.name}...</p>}{selectedFacultyCertificateStudent && facultyStudentCertificatesError && <div className="error-box">{facultyStudentCertificatesError}</div>}{selectedFacultyCertificateStudent && !facultyStudentCertificatesLoading && !facultyStudentCertificatesError && !facultyStudentCertificates.length && <p>No certificate records found for {selectedFacultyCertificateStudent.name}.</p>}{selectedFacultyCertificateStudent && !facultyStudentCertificatesLoading && !facultyStudentCertificatesError && facultyStudentCertificates.map((certificate) => <CertificateCard key={certificate.id} certificate={certificate} />)}</div>
          </div>}

          {/* Faculty complaints and student complaints. */}
          {facultySection === "complaints" && <div><div style={facultyCardStyle}><h2>⚠️ Faculty Complaints / Grievances</h2><button onClick={() => setFacultyComplaintFormOpen(!facultyComplaintFormOpen)}>{facultyComplaintFormOpen ? "Close Form" : "➕ Submit Complaint"}</button>{facultyComplaintMessage && <div className="success-box">{facultyComplaintMessage}</div>}{facultyComplaintFormOpen && <form onSubmit={handleFacultyComplaintSubmit} style={facultyCardStyle}><div className="form-group"><label>Category</label><select value={facultyComplaintCategory} onChange={(e) => setFacultyComplaintCategory(e.target.value)}>{["Academic","Administration","Infrastructure","HR / Employment","Salary / Finance","Student Management","Other"].map(x => <option key={x}>{x}</option>)}</select></div><div className="form-group"><label>Complaint Title</label><input value={facultyComplaintTitle} onChange={(e) => setFacultyComplaintTitle(e.target.value)} required /></div><div className="form-group"><label>Description</label><textarea value={facultyComplaintDescription} onChange={(e) => setFacultyComplaintDescription(e.target.value)} required /></div><div className="form-group"><label>📷 Supporting Photo (optional)</label><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFacultyComplaintPhoto(e.target.files?.[0] || null)} />{facultyComplaintPhoto && <small>Selected: {facultyComplaintPhoto.name}</small>}</div><div className="form-group"><label>Send To</label><select value={facultyComplaintAuthority} onChange={(e) => setFacultyComplaintAuthority(e.target.value)}><option>Admin</option><option>Higher Authority</option></select></div><button disabled={facultyComplaintSubmitting}>{facultyComplaintSubmitting ? "Submitting..." : "Submit Complaint"}</button></form>}{facultyComplaintsError && <div className="error-box">{facultyComplaintsError}</div>}</div><div style={facultyCardStyle}><h2>📋 My Submitted Complaints</h2>{facultyComplaintsLoading && <p>Loading complaints...</p>}{!facultyComplaintsLoading && !facultyComplaints.length && <p>No complaints submitted yet.</p>}{facultyComplaints.map(c => <div className="data-card" key={c.id}><h3>{c.title}</h3><p>Category: {c.category}</p><p>{c.description}</p>{c.photo_path && <img src={fileUrl(c.photo_path)} alt="Complaint proof" style={{ maxWidth: "260px", maxHeight: "180px", objectFit: "cover", borderRadius: "12px", margin: "8px 0" }} />}<p>Submitted To: {c.assigned_to_role || c.target_authority || "Admin"}</p><p>Status: <strong>{c.status || "Pending"}</strong></p>{c.admin_response && <p>Admin Response: {c.admin_response}</p>}</div>)}</div><div style={facultyCardStyle}><h2>🎓 Student Complaints</h2>{studentComplaintsLoading && <p>Loading student complaints...</p>}{studentComplaintsError && <div className="error-box">{studentComplaintsError}</div>}{!studentComplaintsLoading && !studentComplaints.length && <p>No student complaints available.</p>}{studentComplaints.map(c => <div className="data-card" key={c.id}><h3>{c.title || c.category || "Student Complaint"}</h3><p>Student ID: {c.student_id || c.complainant_id || c.applicant_id || "N/A"}</p><p>Category: {c.category || "N/A"}</p><p>Description: {c.description || c.content || "N/A"}</p><p>Location: {c.location || "N/A"}</p>{c.photo_path && <img src={fileUrl(c.photo_path)} alt="Student complaint proof" style={{ maxWidth: "280px", maxHeight: "190px", objectFit: "cover", borderRadius: "12px", margin: "8px 0" }} />}<p>Status: <strong>{c.status || "Pending"}</strong></p></div>)}</div></div>}

          {/* Faculty pending actions. */}
          {facultySection === "pending" && <div style={facultyCardStyle}><h2>🔔 Pending Actions</h2>{pendingActionsLoading && <p>Loading...</p>}{pendingActionsError && <div className="error-box">{pendingActionsError}</div>}{pendingActions.map((a,i) => <div className="data-card" key={a.id || i}><h3>{a.title || a.type || "Pending Action"}</h3><p>{a.description || a.message}</p>{a.count !== undefined && <p>Count: {a.count}</p>}</div>)}{!pendingActionsLoading && !pendingActions.length && <p>No pending actions.</p>}</div>}
        </div>
      )}

      {/* ============================================================
          ADMIN DASHBOARD
          Email + password login is used for now. OTP can be added later.
          ============================================================ */}
      {adminDashboardOpen && adminData && (
        <div className="student-dashboard role-dashboard admin-role-dashboard">
          <div className="dashboard-top dashboard-top-modern">
            <div>
              <p className="dashboard-welcome">Welcome back 👋</p>
              <h1>Admin Dashboard</h1><span className="dashboard-role-badge">ADMIN • CAMPUS OPERATIONS</span>
              <p className="dashboard-subtitle">
                {adminData.name || "Omni360 Administrator"}
              </p>
            </div>
            <button className="dashboard-logout" onClick={handleAdminLogout}>
              Logout
            </button>
          </div>

          <div style={facultyCardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                {adminData.profile_photo ? (
                  <img src={fileUrl(adminData.profile_photo)} alt="Admin profile" style={{ width: "68px", height: "68px", borderRadius: "50%", objectFit: "cover", border: "3px solid rgba(99,102,241,.22)" }} />
                ) : <div className="profile-icon" style={{ width: "68px", height: "68px" }}>🛡️</div>}
                <div>
                  <h2 style={{ marginBottom: "6px" }}>🛡️ Omni360 Administration</h2>
                  <p style={{ margin: 0 }}>
                    {adminData.department || "Administration"} · {adminData.email}
                  </p>
                  <div className="button-row">
                    <label style={{ cursor: "pointer", fontSize: "13px" }}>
                      {profilePhotoUploading === `Admin-${adminData.id}` ? "Uploading..." : "📷 Change Admin Photo"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0] || null; if (file) { setProfilePhotoEditor({ role: "Admin", userId: adminData.id, file }); } e.target.value = ""; }} />
                    </label>
                    {adminData.profile_photo && <button type="button" onClick={() => { if (window.confirm("Remove your Admin profile photo?")) handleProfilePhotoDelete("Admin", adminData.id); }}>🗑 Remove</button>}
                  </div>
                </div>
              </div>
              <button type="button" onClick={loadAdminDashboardSummary} disabled={adminSummaryLoading}>
                {adminSummaryLoading ? "Refreshing..." : "↻ Refresh Data"}
              </button>
            </div>
          </div>
          {profilePhotoError && <div className="error-box">{profilePhotoError}</div>}
          {profilePhotoMessage && <div className="success-box">{profilePhotoMessage}</div>}

          {adminSummaryError && (
            <div className="error-box">{adminSummaryError}</div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
              gap: "18px",
              marginBottom: "24px",
            }}
          >
            {[
              ["🎓", "Total Students", adminSummary.total_students],
              ["👨‍🏫", "Total Faculty", adminSummary.total_faculty],
              ["📄", "Pending Applications", adminSummary.pending_applications],
              ["⚠️", "Open Complaints", adminSummary.open_complaints],
              ["🚪", "Pending Gate Passes", adminSummary.pending_gate_passes],
              ["🏆", "Certificates", adminSummary.total_certificates],
              ["💳", "Students With Pending Fees", adminSummary.students_with_pending_fees],
              ["📢", "Campus Notices", adminSummary.total_notices],
            ].map(([icon, label, value]) => (
              <div
                key={label}
                style={{
                  padding: "22px",
                  borderRadius: "18px",
                  background: "rgba(255,255,255,.92)",
                  border: "1px solid rgba(99,102,241,.14)",
                  boxShadow: "0 15px 45px rgba(15,23,42,.08)",
                }}
              >
                <div style={{ fontSize: "28px", marginBottom: "10px" }}>{icon}</div>
                <div style={{ fontSize: "34px", fontWeight: 800 }}>
                  {adminSummaryLoading ? "…" : value ?? 0}
                </div>
                <div style={{ marginTop: "4px", opacity: 0.72 }}>{label}</div>
              </div>
            ))}
          </div>

          <div style={facultyCardStyle}>
            <h2>📊 Campus Overview</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "15px" }}>
              <div className="data-card">
                <h3>📝 Applications</h3>
                <p>Total requests: <strong>{adminSummary.total_applications ?? 0}</strong></p>
                <p>Waiting for action: <strong>{adminSummary.pending_applications ?? 0}</strong></p>
              </div>
              <div className="data-card">
                <h3>🚧 Campus Issues</h3>
                <p>Total reported: <strong>{adminSummary.total_complaints ?? 0}</strong></p>
                <p>Open / in progress: <strong>{adminSummary.open_complaints ?? 0}</strong></p>
              </div>
              <div className="data-card">
                <h3>🚪 Gate Passes</h3>
                <p>Total requests: <strong>{adminSummary.total_gate_passes ?? 0}</strong></p>
                <p>Pending approval: <strong>{adminSummary.pending_gate_passes ?? 0}</strong></p>
              </div>
              <div className="data-card">
                <h3>🏠 Hostel</h3>
                <p>Registered residents: <strong>{adminSummary.hostel_residents ?? 0}</strong></p>
              </div>
            </div>
          </div>

          {/* Admin navigation between dashboard modules. */}
          <div style={facultyCardStyle}>
            <h2>🧭 Administration Modules</h2>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button className="module-button" type="button" onClick={() => openAdminSection("overview")}><span>📊</span><strong>Overview</strong><small>Live campus summary</small></button>
              <button className="module-button" type="button" onClick={() => openAdminSection("users")}><span>👥</span><strong>User Management</strong><small>Students & faculty</small></button>
              <button className="module-button" type="button" onClick={() => openAdminSection("complaints")}><span>⚠️</span><strong>Complaints</strong><small>Issues & grievances</small></button>
              <button className="module-button" type="button" onClick={() => openAdminSection("applications")}><span>📄</span><strong>Applications</strong><small>Requests & approvals</small></button>
              <button className="module-button" type="button" onClick={() => openAdminSection("gatepasses")}><span>🚪</span><strong>Gate Passes</strong><small>Faculty & Warden flow</small></button>
              <button className="module-button" type="button" onClick={() => openAdminSection("certificates")}><span>🏆</span><strong>Certificates</strong><small>Issue & manage</small></button>
              <button className="module-button" type="button" onClick={() => openAdminSection("fees")}><span>💰</span><strong>Fees</strong><small>Payments & credits</small></button>
              <button className="module-button" type="button" onClick={() => openAdminSection("notices")}><span>📢</span><strong>Notices</strong><small>Campus communication</small></button>
              <button className="module-button" type="button" onClick={() => openAdminSection("reports")}><span>📈</span><strong>Reports</strong><small>Analytics & insights</small></button>
            </div>
          </div>

          {/* ========================================================
              ADMIN USER MANAGEMENT
              ======================================================== */}
          {adminSection === "users" && (
            <div className="admin-module-page" style={facultyCardStyle}>
              <div className="module-page-header"><div><span className="module-kicker">ADMIN • USER MANAGEMENT</span><h2>👥 User Management</h2><p>Manage the Student and Faculty accounts stored in the Omni360 database.</p></div><button type="button" onClick={() => openAdminSection("overview")}>← Back to Overview</button></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
                <div>
                  <p style={{ marginTop: 0 }}>Use the controls below to register, search and organize campus accounts.</p>
                </div>
                <button type="button" onClick={loadAdminUsers} disabled={adminUsersLoading}>
                  {adminUsersLoading ? "Refreshing..." : "↻ Refresh Users"}
                </button>
              </div>

              <div className="form-group">
                <label>Search users</label>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <input value={adminUserSearch} onChange={(e) => setAdminUserSearch(e.target.value)} placeholder="Name, email, roll number, department..." />
                  <button type="button" onClick={loadAdminUsers}>Search</button>
                  <button type="button" onClick={() => { setAdminUserSearch(""); loadAdminUsers(); }}>Clear</button>
                </div>
              </div>

              {adminUsersError && <div className="error-box">{adminUsersError}</div>}

              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "18px" }}>
                <button type="button" onClick={() => setAdminUserTab("students")}>🎓 Students ({Array.isArray(adminStudents) ? adminStudents.length : 0})</button>
                <button type="button" onClick={() => setAdminUserTab("faculty")}>👨‍🏫 Faculty ({Array.isArray(adminFaculty) ? adminFaculty.length : 0})</button>
                <button type="button" onClick={() => { setAdminStudentFormOpen(!adminStudentFormOpen); setAdminFacultyFormOpen(false); }}>{adminStudentFormOpen ? "Close Student Form" : "➕ Add Student"}</button>
                <button type="button" onClick={() => { setAdminFacultyFormOpen(!adminFacultyFormOpen); setAdminStudentFormOpen(false); }}>{adminFacultyFormOpen ? "Close Faculty Form" : "➕ Add Faculty"}</button>
              </div>

              {adminStudentFormOpen && (
                <form onSubmit={handleAdminStudentSubmit} style={facultyCardStyle}>
                  <h3>➕ Register Student</h3>
                  <div className="form-group"><label>Full Name</label><input value={adminStudentName} onChange={(e) => setAdminStudentName(e.target.value)} placeholder="e.g., Anu Sharma" required /></div>
                  <div className="form-group"><label>Roll Number</label><input value={adminStudentRoll} onChange={(e) => setAdminStudentRoll(e.target.value)} placeholder="e.g., MCA001" required /></div>
                  <div className="form-group"><label>Course</label><input value={adminStudentCourse} onChange={(e) => setAdminStudentCourse(e.target.value)} placeholder="e.g., MCA" required /></div>
                  <div className="form-group"><label>Semester</label><input value={adminStudentSemester} onChange={(e) => setAdminStudentSemester(e.target.value)} placeholder="e.g., 1st Semester" required /></div>
                  <div className="form-group"><label>Department</label><input value={adminStudentDepartment} onChange={(e) => setAdminStudentDepartment(e.target.value)} placeholder="e.g., Computer Applications" /></div>
                  <div className="form-group"><label>Email</label><input type="email" value={adminStudentEmail} onChange={(e) => setAdminStudentEmail(e.target.value)} placeholder="e.g., student@college.edu" required /></div>
                  <div className="form-group"><label>Initial Password <small>(optional)</small></label><input type="password" minLength="8" value={adminStudentPassword} onChange={(e) => setAdminStudentPassword(e.target.value)} placeholder="Optional — leave blank for activation" /><small className="form-help">Use at least 8 characters when setting one. Leave blank to let the student activate later.</small></div>
                  <button disabled={adminStudentSubmitting}>{adminStudentSubmitting ? "Creating..." : "Create Student"}</button>
                </form>
              )}

              {adminFacultyFormOpen && (
                <form onSubmit={handleAdminFacultySubmit} style={facultyCardStyle}>
                  <h3>➕ Register Faculty</h3>
                  <div className="form-group"><label>Full Name</label><input value={adminFacultyName} onChange={(e) => setAdminFacultyName(e.target.value)} placeholder="e.g., Dr. Priya Sharma" required /></div>
                  <div className="form-group"><label>Employee ID</label><input value={adminFacultyEmployeeId} onChange={(e) => setAdminFacultyEmployeeId(e.target.value)} placeholder="e.g., FAC001" required /></div>
                  <div className="form-group"><label>Department</label><input value={adminFacultyDepartment} onChange={(e) => setAdminFacultyDepartment(e.target.value)} placeholder="e.g., Computer Applications" required /></div>
                  <div className="form-group"><label>Designation</label><input value={adminFacultyDesignation} onChange={(e) => setAdminFacultyDesignation(e.target.value)} placeholder="e.g., Assistant Professor" required /></div><div className="form-group"><label>Hostel Authority Role</label><select value={adminFacultyHostelRole} onChange={(e) => setAdminFacultyHostelRole(e.target.value)}><option>Faculty</option><option>Assistant Warden</option><option>Warden</option></select><small className="form-help">Warden / Assistant Warden are Faculty members assigned hostel authority by Admin.</small></div>
                  <div className="form-group"><label>Email</label><input type="email" value={adminFacultyEmail} onChange={(e) => setAdminFacultyEmail(e.target.value)} placeholder="e.g., faculty@college.edu" required /></div>
                  <div className="form-group"><label>Initial Password <small>(optional)</small></label><input type="password" minLength="8" value={adminFacultyPassword} onChange={(e) => setAdminFacultyPassword(e.target.value)} placeholder="Optional — leave blank for activation" /><small className="form-help">Use at least 8 characters when setting one. Leave blank so the faculty member activates later.</small></div>
                  <button disabled={adminFacultySubmitting}>{adminFacultySubmitting ? "Creating..." : "Create Faculty"}</button>
                </form>
              )}

              {adminUsersLoading && <p>Loading user records...</p>}

              {!adminUsersLoading && adminUserTab === "students" && (
                <div style={{ display: "grid", gap: "14px" }}>
                  {Object.entries(groupedAdminStudents).sort(([a],[b]) => a.localeCompare(b)).map(([department, semesters]) => (
                    <details key={department} open style={{ border: "1px solid rgba(99,102,241,.14)", borderRadius: "16px", padding: "14px", background: "rgba(255,255,255,.7)" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: "18px" }}>🏫 {department} · {Object.values(semesters).reduce((n, list) => n + list.length, 0)} Students</summary>
                      <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                        {Object.entries(semesters).sort(([a],[b]) => a.localeCompare(b)).map(([semester, students]) => (
                          <details key={semester} open>
                            <summary style={{ cursor: "pointer", fontWeight: 700 }}>📚 {semester} · {students.length} Students</summary>
                            <div style={{ display: "grid", gap: "10px", marginTop: "10px" }}>
                              {students.map((student) => (
                                <div className="data-card" key={student.id}>
                                  <div style={{ display: "flex", justifyContent: "space-between", gap: "15px", flexWrap: "wrap" }}>
                                    <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                                      {student.profile_photo ? <img src={fileUrl(student.profile_photo)} alt="Student" style={{ width: "58px", height: "58px", borderRadius: "50%", objectFit: "cover" }} /> : <div className="profile-icon" style={{ width: "58px", height: "58px" }}>🎓</div>}
                                      <div>
                                        <h3 style={{ marginBottom: "5px" }}>🎓 {student.name}</h3>
                                        <p><strong>Roll:</strong> {student.roll_number} · <strong>Course:</strong> {student.course}</p>
                                        <p><strong>Department:</strong> {department} · <strong>Semester:</strong> {student.semester}</p>
                                        <p><strong>Department Student No.:</strong> {student.department_student_number || "N/A"}</p>
                                        <p><strong>Global Student ID:</strong> {student.id}</p>
                                        <p><strong>Email:</strong> {student.email}</p>
                                        <div className="form-group" style={{ marginTop: "8px" }}>
                                          <label>Change Department</label>
                                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                            <input value={adminStudentDepartmentDrafts[student.id] ?? (student.department || student.course || "")} onChange={(e) => setAdminStudentDepartmentDrafts((current) => ({ ...current, [student.id]: e.target.value }))} />
                                            <button type="button" disabled={adminStudentDepartmentSavingId === student.id} onClick={() => handleAdminStudentDepartmentUpdate(student.id)}>{adminStudentDepartmentSavingId === student.id ? "Saving..." : "Save Department"}</button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    <span className={`status-pill ${statusClass(student.account_status)}`}>{student.account_status}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                  {!Object.keys(groupedAdminStudents).length && <p>No students found.</p>}
                </div>
              )}

              {!adminUsersLoading && adminUserTab === "faculty" && (
                <div style={{ display: "grid", gap: "14px" }}>
                  {Object.entries(groupedAdminFaculty).sort(([a],[b]) => a.localeCompare(b)).map(([department, facultyMembers]) => (
                    <details key={department} open style={{ border: "1px solid rgba(99,102,241,.14)", borderRadius: "16px", padding: "14px", background: "rgba(255,255,255,.7)" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 800, fontSize: "18px" }}>🏫 {department} · {facultyMembers.length} Faculty</summary>
                      <div style={{ display: "grid", gap: "10px", marginTop: "12px" }}>
                        {facultyMembers.map((faculty) => (
                          <div className="data-card" key={faculty.id}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "15px", flexWrap: "wrap" }}>
                              <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                                {faculty.profile_photo ? <img src={fileUrl(faculty.profile_photo)} alt="Faculty" style={{ width: "58px", height: "58px", borderRadius: "50%", objectFit: "cover" }} /> : <div className="profile-icon" style={{ width: "58px", height: "58px" }}>👨‍🏫</div>}
                                <div>
                                  <h3 style={{ marginBottom: "5px" }}>👨‍🏫 {faculty.name}</h3>
                                  <p><strong>Department:</strong> {faculty.department} · <strong>Designation:</strong> {faculty.designation}</p>
                                  <p><strong>Department Faculty No.:</strong> {faculty.department_faculty_number || "N/A"}</p>
                                  <p><strong>Global Faculty ID:</strong> {faculty.id} · <strong>Employee ID:</strong> {faculty.employee_id}</p>
                                  <p><strong>Email:</strong> {faculty.email}</p>
                                  <div className="form-group">
                                    <label>Hostel Authority Role</label>
                                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                                      <select value={adminFacultyHostelRoleDrafts[faculty.id] ?? faculty.hostel_role ?? "Faculty"} onChange={(e) => setAdminFacultyHostelRoleDrafts((current) => ({ ...current, [faculty.id]: e.target.value }))}>
                                        <option>Faculty</option>
                                        <option>Assistant Warden</option>
                                        <option>Warden</option>
                                      </select>
                                      <button type="button" disabled={adminFacultyHostelRoleSavingId === faculty.id} onClick={() => handleAdminFacultyHostelRoleUpdate(faculty.id)}>{adminFacultyHostelRoleSavingId === faculty.id ? "Saving..." : "Save Role"}</button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              <span className={`status-pill ${statusClass(faculty.account_status)}`}>{faculty.account_status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))}
                  {!Object.keys(groupedAdminFaculty).length && <p>No faculty members found.</p>}
                </div>
              )}
            </div>
          )}

          {/* ========================================================
              ADMIN COMPLAINT MANAGEMENT
              ======================================================== */}
          {adminSection === "complaints" && (
            <div style={facultyCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
                <div>
                  <h2>⚠️ Complaint Management</h2>
                  <p style={{ marginTop: 0 }}>Review campus issues reported by students and update their resolution status.</p>
                </div>
                <button type="button" onClick={loadAdminComplaints} disabled={adminComplaintsLoading}>
                  {adminComplaintsLoading ? "Refreshing..." : "↻ Refresh Complaints"}
                </button>
              </div>

              {adminComplaintsError && <div className="error-box">{adminComplaintsError}</div>}
              {adminComplaintsMessage && <div className="success-box">{adminComplaintsMessage}</div>}

              {!adminComplaintsLoading && !adminComplaintsError && adminComplaints.length === 0 && (
                <div className="data-card">
                  <h3>✅ No campus complaints</h3>
                  <p>There are currently no reported campus issues in the database.</p>
                </div>
              )}

              {!adminComplaintsLoading && adminComplaints.length > 0 && (
                <div style={{ display: "grid", gap: "16px", marginTop: "18px" }}>
                  {adminComplaints.map((issue) => {
                    const draftStatus = adminComplaintStatusDrafts[issue.id] || issue.status || "Pending";
                    const draftDepartment = adminComplaintDepartmentDrafts[issue.id] ?? issue.assigned_department ?? "";
                    const isUpdating = adminComplaintUpdatingId === issue.id;

                    return (
                      <div className="data-card" key={issue.id} style={{ padding: "20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div>
                            <h3 style={{ marginBottom: "6px" }}>Issue #{issue.id} · {issue.category || "Campus Issue"}</h3>
                            <p style={{ margin: "4px 0" }}><strong>Student ID:</strong> {issue.student_id}</p>
                            <p style={{ margin: "4px 0" }}><strong>Location:</strong> {issue.location || "Not provided"}</p>
                            <p style={{ margin: "4px 0" }}><strong>Reported:</strong> {issue.created_at || "N/A"}</p>
                            {issue.photo_path && <img src={fileUrl(issue.photo_path)} alt="Campus issue proof" style={{ maxWidth: "280px", maxHeight: "190px", objectFit: "cover", borderRadius: "12px", marginTop: "10px" }} />}
                          </div>
                          <span className={`status-pill ${statusClass(issue.status || "Pending")}`}>
                            {issue.status || "Pending"}
                          </span>
                        </div>

                        <div style={{ marginTop: "14px", padding: "14px", borderRadius: "12px", background: "rgba(15,23,42,.04)" }}>
                          <strong>Description</strong>
                          <p style={{ marginBottom: 0 }}>{issue.description || "No description provided."}</p>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginTop: "16px" }}>
                          <div className="form-group">
                            <label>Status</label>
                            <select
                              value={draftStatus}
                              onChange={(e) => setAdminComplaintStatusDrafts((current) => ({ ...current, [issue.id]: e.target.value }))}
                            >
                              <option>Pending</option>
                              <option>In Progress</option>
                              <option>Resolved</option>
                              <option>Rejected</option>
                            </select>
                          </div>

                          <div className="form-group">
                            <label>Assigned Department</label>
                            <select
                              value={draftDepartment}
                              onChange={(e) => setAdminComplaintDepartmentDrafts((current) => ({ ...current, [issue.id]: e.target.value }))}
                            >
                              <option value="">Not assigned</option>
                              {['Administration','Maintenance','Electrical','Sanitation','Hostel','IT / Computer','Academic','Security','Library','Other'].map((department) => (
                                <option key={department} value={department}>{department}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="button-row" style={{ marginTop: "10px" }}>
                          <button type="button" disabled={isUpdating} onClick={() => handleAdminComplaintUpdate(issue.id)}>
                            {isUpdating ? "Updating..." : "💾 Save Complaint Update"}
                          </button>
                        </div>

                        {issue.updated_at && <small>Last updated: {issue.updated_at}</small>}
                      </div>
                    );
                  })}
                </div>
              )}


              <div style={{ ...facultyCardStyle, marginTop: "18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <div><h2>👨‍🏫 Faculty Grievances</h2><p>Faculty complaints submitted to Admin or Higher Authority.</p></div>
                  <button type="button" onClick={loadAdminFacultyComplaints}>↻ Refresh Faculty Complaints</button>
                </div>
                {adminFacultyComplaintsError && <div className="error-box">{adminFacultyComplaintsError}</div>}
                {adminFacultyComplaintsLoading && <p>Loading Faculty grievances...</p>}
                {!adminFacultyComplaintsLoading && !adminFacultyComplaints.length && <p>No Faculty grievances found.</p>}
                {adminFacultyComplaints.map((complaint) => {
                  const updating = adminFacultyComplaintUpdatingId === complaint.id;
                  return <div className="data-card" key={complaint.id}>
                    <h3>{complaint.title}</h3>
                    <p><strong>Faculty:</strong> {complaint.complainant_name || complaint.complainant_id}</p>
                    <p><strong>Category:</strong> {complaint.category}</p>
                    <p>{complaint.description}</p>
                    {complaint.photo_path && <img src={fileUrl(complaint.photo_path)} alt="Faculty grievance proof" style={{ maxWidth: "280px", maxHeight: "190px", objectFit: "cover", borderRadius: "12px", margin: "8px 0" }} />}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginTop: "12px" }}>
                      <div className="form-group"><label>Status</label><select value={adminFacultyComplaintStatusDrafts[complaint.id] || complaint.status || "Pending"} onChange={(e) => setAdminFacultyComplaintStatusDrafts((current) => ({ ...current, [complaint.id]: e.target.value }))}><option>Pending</option><option>In Progress</option><option>Resolved</option><option>Rejected</option></select></div>
                      <div className="form-group"><label>Admin Response</label><textarea value={adminFacultyComplaintResponseDrafts[complaint.id] ?? ""} onChange={(e) => setAdminFacultyComplaintResponseDrafts((current) => ({ ...current, [complaint.id]: e.target.value }))} placeholder="Write a response or resolution note" /></div>
                    </div>
                    <button type="button" disabled={updating} onClick={() => handleAdminFacultyComplaintUpdate(complaint.id)}>{updating ? "Updating..." : "💾 Save Faculty Complaint Update"}</button>
                  </div>;
                })}
              </div>
              <button type="button" onClick={() => openAdminSection("overview")} style={{ marginTop: "20px" }}>← Back to Overview</button>
            </div>
          )}

          {/* ========================================================
              ADMIN APPLICATION MANAGEMENT
              ======================================================== */}
          {adminSection === "applications" && (
            <div style={facultyCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
                <div>
                  <h2>📄 Application Management</h2>
                  <p style={{ marginTop: 0 }}>Review campus requests and approve or reject them from the Admin panel.</p>
                </div>
                <button type="button" onClick={loadAdminApplications} disabled={adminApplicationsLoading}>
                  {adminApplicationsLoading ? "Refreshing..." : "↻ Refresh Applications"}
                </button>
              </div>

              {adminApplicationsError && <div className="error-box">{adminApplicationsError}</div>}
              {adminApplicationsMessage && <div className="success-box">{adminApplicationsMessage}</div>}

              {!adminApplicationsLoading && !adminApplicationsError && adminApplications.length === 0 && (
                <div className="data-card">
                  <h3>✅ No applications found</h3>
                  <p>There are currently no campus requests in the database.</p>
                </div>
              )}

              {!adminApplicationsLoading && adminApplications.length > 0 && (
                <div style={{ display: "grid", gap: "16px", marginTop: "18px" }}>
                  {adminApplications.map((application) => {
                    const isProcessing = adminApplicationProcessingId === application.id;
                    const isPending = String(application.status || "Pending").toLowerCase() === "pending";

                    return (
                      <div className="data-card" key={application.id} style={{ padding: "20px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                          <div>
                            <h3 style={{ marginBottom: "6px" }}>Application #{application.id} · {application.application_type || "Request"}</h3>
                            <p style={{ margin: "4px 0" }}><strong>Student ID:</strong> {application.applicant_id}</p>
                            <p style={{ margin: "4px 0" }}><strong>Applicant Role:</strong> {application.applicant_role || "Student"}</p>
                            <p style={{ margin: "4px 0" }}><strong>Title:</strong> {application.title || "N/A"}</p>
                            <p style={{ margin: "4px 0" }}><strong>Submitted:</strong> {application.created_at || "N/A"}</p>
                          </div>
                          <span className={`status-pill ${statusClass(application.status || "Pending")}`}>
                            {application.status || "Pending"}
                          </span>
                        </div>

                        <div style={{ marginTop: "14px", padding: "14px", borderRadius: "12px", background: "rgba(15,23,42,.04)" }}>
                          <strong>Description</strong>
                          <p style={{ marginBottom: 0 }}>{application.description || "No description provided."}</p>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginTop: "14px" }}>
                          <div className="data-card">
                            <p style={{ margin: 0 }}><strong>Start Date</strong></p>
                            <p style={{ marginBottom: 0 }}>{application.start_date || "Not specified"}</p>
                          </div>
                          <div className="data-card">
                            <p style={{ margin: 0 }}><strong>End Date</strong></p>
                            <p style={{ marginBottom: 0 }}>{application.end_date || "Not specified"}</p>
                          </div>
                          <div className="data-card">
                            <p style={{ margin: 0 }}><strong>Current Approver</strong></p>
                            <p style={{ marginBottom: 0 }}>{application.current_approver_role || "None"}</p>
                          </div>
                        </div>

                        {isPending && (
                          <div className="button-row" style={{ marginTop: "16px" }}>
                            <button type="button" disabled={isProcessing} onClick={() => handleAdminApplicationDecision(application.id, "approve")}>
                              {isProcessing ? "Processing..." : "✅ Approve"}
                            </button>
                            <button type="button" disabled={isProcessing} onClick={() => handleAdminApplicationDecision(application.id, "reject")}>
                              ❌ Reject
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <button type="button" onClick={() => openAdminSection("overview")} style={{ marginTop: "20px" }}>← Back to Overview</button>
            </div>
          )}

          {/* ========================================================
              ADMIN GATE PASS MANAGEMENT
              ======================================================== */}
          {adminSection === "gatepasses" && (
            <div style={facultyCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "15px", flexWrap: "wrap" }}>
                <div>
                  <h2>🚪 Gate Pass Monitoring</h2>
                  <p style={{ marginTop: 0 }}>Admin monitors the hostel approval chain. Final approval is completed by the designated Warden or Assistant Warden.</p>
                </div>
                <button type="button" onClick={loadAdminGatePasses} disabled={adminGatePassesLoading}>{adminGatePassesLoading ? "Refreshing..." : "↻ Refresh Gate Passes"}</button>
              </div>
              {adminGatePassesError && <div className="error-box">{adminGatePassesError}</div>}
              {adminGatePassesMessage && <div className="success-box">{adminGatePassesMessage}</div>}
              <div className="authority-panel">
                <div className="authority-panel-header">
                  <div>
                    <span className="section-kicker">HOSTEL AUTHORITY</span>
                    <h3>Who is the Warden?</h3>
                    <p>A Warden or Assistant Warden is a <strong>Faculty account</strong> that the Admin has assigned a hostel authority role to under <strong>User Management → Faculty</strong>.</p>
                  </div>
                  <button type="button" onClick={() => openAdminSection("users")}>Manage Faculty Roles →</button>
                </div>
                {adminHostelAuthorities.length ? (
                  <div className="authority-list">{adminHostelAuthorities.map((authority) => (
                    <div className="authority-chip" key={authority.id}>
                      {authority.profile_photo ? <img src={fileUrl(authority.profile_photo)} alt="" /> : <span className="authority-avatar">{String(authority.name || "W").charAt(0)}</span>}
                      <div><strong>{authority.name}</strong><span>{authority.hostel_role} · {authority.department || "No department"}</span></div>
                    </div>
                  ))}</div>
                ) : (
                  <div className="warning-box">No Warden or Assistant Warden is currently assigned. Go to <strong>User Management → Faculty</strong>, choose a faculty member, set <strong>Hostel Authority Role</strong>, and save it.</div>
                )}
              </div>
              {!adminGatePassesLoading && !adminGatePasses.length && <p>No gate-pass requests found.</p>}
              {!adminGatePassesLoading && adminGatePasses.length > 0 && <div style={{ display: "grid", gap: "16px", marginTop: "18px" }}>
                {adminGatePasses.map((pass) => <div className="data-card" key={pass.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
                    <div><h3>🪪 Gate Pass #{pass.id}</h3><p><strong>Student:</strong> {pass.student_name} — {pass.roll_number} (ID {pass.student_id})</p><p><strong>Reason:</strong> {pass.reason}</p><p><strong>Destination:</strong> {pass.destination}</p></div>
                    <span className={`status-pill ${statusClass(pass.status || "Pending")}`}>{pass.status || "Pending"}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: "12px", marginTop: "14px" }}>
                    <div className="data-card"><strong>Departure</strong><p>{pass.departure_date} {pass.departure_time}</p></div>
                    <div className="data-card"><strong>Return</strong><p>{pass.return_date} {pass.return_time}</p></div>
                    <div className="data-card"><strong>Current Stage</strong><p>{pass.current_approver_role === "Faculty" ? "Faculty Approval" : pass.current_approver_role === "Warden" ? "Warden / Assistant Warden Approval" : "Completed"}</p></div>
                  </div>
                  <div style={{ marginTop: "16px", padding: "16px", borderRadius: "14px", background: "rgba(15,23,42,.04)" }}>
                    <h3 style={{ marginTop: 0 }}>Approval Chain</h3>
                    <p>✅ <strong>Faculty:</strong> {pass.faculty_approved_by_name ? `${pass.faculty_approved_by_name} · ${pass.faculty_approved_at || "time unavailable"}` : "Pending Faculty Approval"}</p>
                    <p>🏠 <strong>Warden:</strong> {pass.warden_approved_by_name ? `${pass.warden_approved_by_name} · ${pass.warden_approved_at || "time unavailable"}` : "Pending Warden Approval"}</p>
                  </div>
                  {pass.pass_code && <div className="success-box" style={{ marginTop: "12px" }}><strong>Digital Gate Pass:</strong> {pass.pass_code}</div>}
                  {pass.exit_time && <p><strong>Exit Recorded:</strong> {pass.exit_time}</p>}
                  {pass.actual_return_time && <p><strong>Return Recorded:</strong> {pass.actual_return_time}</p>}
                  <small>Admin is monitoring this process; approval actions are performed by Faculty/Warden.</small>
                </div>)}
              </div>}
              <button type="button" onClick={() => openAdminSection("overview")} style={{ marginTop: "20px" }}>← Back to Overview</button>
            </div>
          )}

          {/* ========================================================
              ADMIN CERTIFICATE MANAGEMENT
              ======================================================== */}
          {adminSection === "certificates" && (
            <div style={facultyCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <div><h2>🏆 Certificate Management</h2><p>View certificates across the campus and issue certificates to students.</p></div>
                <div className="button-row"><button type="button" onClick={() => setAdminCertificateFormOpen(!adminCertificateFormOpen)}>{adminCertificateFormOpen ? "Close Form" : "➕ Issue Certificate"}</button><button type="button" onClick={loadAdminCertificates}>↻ Refresh</button></div>
              </div>
              {adminCertificatesError && <div className="error-box">{adminCertificatesError}</div>}
              {adminCertificatesMessage && <div className="success-box">{adminCertificatesMessage}</div>}
              {adminCertificateFormOpen && <form onSubmit={handleAdminCertificateSubmit} style={facultyCardStyle}>
                <div className="certificate-student-picker">
                  <div className="picker-step"><span className="picker-step-number">1</span><div className="form-group"><label>Department</label><select value={adminCertificateDepartment} onChange={(e) => { setAdminCertificateDepartment(e.target.value); setAdminCertificateSemester(""); setAdminCertificateStudentId(""); }} required><option value="">Select Department</option>{adminCertificateDepartments.map((department) => <option key={department} value={department}>{department}</option>)}</select></div></div>
                  <div className="picker-step"><span className="picker-step-number">2</span><div className="form-group"><label>Semester</label><select value={adminCertificateSemester} onChange={(e) => { setAdminCertificateSemester(e.target.value); setAdminCertificateStudentId(""); }} disabled={!adminCertificateDepartment} required><option value="">{adminCertificateDepartment ? "Select Semester" : "Select Department First"}</option>{adminCertificateSemesters.map((semester) => <option key={semester} value={semester}>{semester}</option>)}</select></div></div>
                  <div className="picker-step"><span className="picker-step-number">3</span><div className="form-group"><label>Student</label><select value={adminCertificateStudentId} onChange={(e) => setAdminCertificateStudentId(e.target.value)} disabled={!adminCertificateSemester} required><option value="">{adminCertificateSemester ? "Select Student" : "Select Semester First"}</option>{adminCertificateStudents.map((student) => <option key={student.id} value={student.id}>{student.name} — {student.roll_number} · Student No. {student.department_student_number || student.id}</option>)}</select></div></div>
                </div>
                {selectedAdminCertificateStudent && (
                  <div className="selected-student-preview">
                    <div className="selected-student-avatar">🎓</div>
                    <div><span>SELECTED STUDENT</span><strong>{selectedAdminCertificateStudent.name}</strong><p>{selectedAdminCertificateStudent.roll_number} · {selectedAdminCertificateStudent.department || selectedAdminCertificateStudent.course} · {selectedAdminCertificateStudent.semester}</p></div>
                  </div>
                )}
                <div className="form-group"><label>Certificate Type</label><select value={adminCertificateType} onChange={(e) => setAdminCertificateType(e.target.value)}>{["Bonafide Certificate","Character Certificate","Course Certificate","Internship Certificate","Achievement Certificate","Other"].map(x => <option key={x}>{x}</option>)}</select></div>
                <div className="form-group"><label>Title</label><input value={adminCertificateTitle} onChange={(e) => setAdminCertificateTitle(e.target.value)} required /></div>
                <div className="form-group"><label>Date</label><input type="date" value={adminCertificateDate} onChange={(e) => setAdminCertificateDate(e.target.value)} /></div>
                <div className="form-group"><label>📎 Proof File (optional)</label><input type="file" accept="application/pdf,image/png,image/jpeg" onChange={(e) => setAdminCertificateFile(e.target.files?.[0] || null)} /></div>
                <button disabled={adminCertificateSubmitting}>{adminCertificateSubmitting ? "Saving..." : "Issue Certificate"}</button>
              </form>}
              {adminCertificatesLoading && <p>Loading certificates...</p>}
              {!adminCertificatesLoading && !adminCertificates.length && <p>No certificate records found.</p>}
              {!adminCertificatesLoading && adminCertificates.map((c) => <div className="data-card" key={c.id}><h3>🏆 {c.title}</h3><p>Student: <strong>{c.student_name}</strong> — {c.roll_number}</p><p>Type: {c.certificate_type}</p><p>Issued/Uploaded by: {c.issued_by || c.uploaded_by_role || "N/A"}</p><p>Date: {c.certificate_date || "N/A"}</p>{c.file_path && <div className="button-row"><a href={fileUrl(c.file_path)} target="_blank" rel="noreferrer"><button type="button">View</button></a><a href={fileUrl(c.file_path)} download><button type="button">Download</button></a></div>}<button type="button" onClick={() => handleAdminCertificateDelete(c.id)}>🗑 Delete</button></div>)}
              <button type="button" onClick={() => openAdminSection("overview")}>← Back to Overview</button>
            </div>
          )}

          {/* ========================================================
              ADMIN FEE MANAGEMENT
              ======================================================== */}
          {adminSection === "fees" && (
            <div style={facultyCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <div><h2>💰 Fee Management</h2><p>Track semester payments, overpayments and reusable fee credits.</p></div>
                <div className="button-row"><button type="button" onClick={() => setAdminFeeFormOpen(!adminFeeFormOpen)}>{adminFeeFormOpen ? "Close Form" : "➕ Add Fee Record"}</button><button type="button" onClick={() => Promise.all([loadAdminFees(), loadAdminUsers()])}>↻ Refresh</button></div>
              </div>
              {adminFeesError && <div className="error-box">{adminFeesError}</div>}
              {adminFeesMessage && <div className="success-box">{adminFeesMessage}</div>}

              {adminFeeFormOpen && <form onSubmit={handleAdminFeeSubmit} style={facultyCardStyle}>
                <div className="form-group"><label>Student</label><select value={adminFeeStudentId} onChange={(e) => setAdminFeeStudentId(e.target.value)} required><option value="">Select a student</option>{adminStudents.map((student) => <option key={student.id} value={student.id}>{student.name} — {student.roll_number} · {student.department || student.course} · {student.semester}</option>)}</select></div>
                <div className="form-group"><label>Semester</label><input value={adminFeeSemester} onChange={(e) => setAdminFeeSemester(e.target.value)} placeholder="1st Semester" required /></div>
                <div className="form-group"><label>Fee Type</label><input value={adminFeeType} onChange={(e) => setAdminFeeType(e.target.value)} /></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: "12px" }}>
                  <div className="form-group"><label>Total Amount</label><input type="number" min="0" step="0.01" value={adminFeeTotal} onChange={(e) => setAdminFeeTotal(e.target.value)} required /></div>
                  <div className="form-group"><label>Paid Amount</label><input type="number" min="0" step="0.01" value={adminFeePaid} onChange={(e) => setAdminFeePaid(e.target.value)} /></div>
                </div>
                <p style={{ opacity: 0.75 }}>Paid amount may exceed the total. Omni360 will mark that fee <strong>Overpaid</strong> and show the extra amount as transferable credit.</p>
                <div className="form-group"><label>Due Date</label><input type="date" value={adminFeeDueDate} onChange={(e) => setAdminFeeDueDate(e.target.value)} /></div>
                <button disabled={adminFeeSubmitting}>{adminFeeSubmitting ? "Saving..." : "Add Fee Record"}</button>
              </form>}

              {adminFeesLoading && <p>Loading fee records...</p>}
              {!adminFeesLoading && !adminFees.length && <p>No fee records found.</p>}
              {!adminFeesLoading && adminFees.map((fee) => {
                const sameStudentTargets = adminFees.filter((candidate) => candidate.student_id === fee.student_id && candidate.id !== fee.id && Number(candidate.pending_amount || 0) > 0);
                return <div className="data-card" key={fee.id}>
                  <h3>{fee.student_name} — {fee.roll_number}</h3>
                  <p>{fee.semester} · {fee.fee_type}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px" }}>
                    <div><strong>Total</strong><p>₹{Number(fee.total_amount || 0).toFixed(2)}</p></div>
                    <div><strong>Paid</strong><p>₹{Number(fee.paid_amount || 0).toFixed(2)}</p></div>
                    <div><strong>Pending</strong><p>₹{Number(fee.pending_amount || 0).toFixed(2)}</p></div>
                    <div><strong>Overpaid</strong><p>₹{Number(fee.overpaid_amount || 0).toFixed(2)}</p></div>
                    <div><strong>Status</strong><p>{fee.status}</p></div>
                  </div>
                  <p>Due Date: {fee.due_date || "N/A"}</p>
                  <div className="form-group"><label>Update Paid Amount</label><div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}><input type="number" min="0" step="0.01" value={adminFeePaidDrafts[fee.id] ?? fee.paid_amount} onChange={(e) => setAdminFeePaidDrafts((current) => ({ ...current, [fee.id]: e.target.value }))} /><button type="button" disabled={adminFeeUpdatingId === fee.id} onClick={() => handleAdminFeeUpdate(fee.id)}>{adminFeeUpdatingId === fee.id ? "Updating..." : "💾 Save Payment"}</button></div></div>
                  {Number(fee.overpaid_amount || 0) > 0 && sameStudentTargets.length > 0 && <div style={{ marginTop: "14px", padding: "14px", borderRadius: "14px", background: "rgba(34,197,94,.08)" }}>
                    <strong>💳 Transfer Overpaid Credit</strong>
                    <p style={{ marginTop: "6px" }}>Available credit: <strong>₹{Number(fee.overpaid_amount || 0).toFixed(2)}</strong></p>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "10px" }}>
                      <select value={adminFeeTransferTargetDrafts[fee.id] || ""} onChange={(e) => setAdminFeeTransferTargetDrafts((current) => ({ ...current, [fee.id]: e.target.value }))}><option value="">Select target semester</option>{sameStudentTargets.map((target) => <option key={target.id} value={target.id}>{target.semester} · Pending ₹{Number(target.pending_amount || 0).toFixed(2)}</option>)}</select>
                      <input type="number" min="0.01" step="0.01" placeholder="Amount (blank = as much as possible)" value={adminFeeTransferAmountDrafts[fee.id] ?? ""} onChange={(e) => setAdminFeeTransferAmountDrafts((current) => ({ ...current, [fee.id]: e.target.value }))} />
                    </div>
                    <button type="button" disabled={adminFeeTransferProcessingId === fee.id} onClick={() => handleAdminFeeTransferCredit(fee.id)}>{adminFeeTransferProcessingId === fee.id ? "Transferring..." : "↔ Apply Credit To Selected Semester"}</button>
                  </div>}
                  {Number(fee.overpaid_amount || 0) > 0 && sameStudentTargets.length === 0 && <div className="success-box" style={{ marginTop: "12px" }}>This student currently has <strong>₹{Number(fee.overpaid_amount || 0).toFixed(2)}</strong> available as fee credit. It can be applied when another semester has a pending balance.</div>}
                </div>;
              })}
              <button type="button" onClick={() => openAdminSection("overview")}>← Back to Overview</button>
            </div>
          )}

          {/* ========================================================
              ADMIN NOTICE MANAGEMENT
              ======================================================== */}
          {adminSection === "notices" && (
            <div style={facultyCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}><div><h2>📢 Notice Management</h2><p>Create and manage campus-wide or targeted notices. Deleting a notice removes the shared database record, so it disappears for Students and Faculty too.</p></div><div className="button-row"><button type="button" onClick={() => setAdminNoticeFormOpen(!adminNoticeFormOpen)}>{adminNoticeFormOpen ? "Close Form" : "➕ Create Notice"}</button><button type="button" onClick={loadAdminNotices}>↻ Refresh</button></div></div>
              {adminNoticesError && <div className="error-box">{adminNoticesError}</div>}
              {adminNoticesMessage && <div className="success-box">{adminNoticesMessage}</div>}
              {adminNoticeFormOpen && <form onSubmit={handleAdminNoticeSubmit} style={facultyCardStyle}><div className="form-group"><label>Title</label><input value={adminNoticeTitle} onChange={(e) => setAdminNoticeTitle(e.target.value)} required /></div><div className="form-group"><label>Content</label><textarea value={adminNoticeContent} onChange={(e) => setAdminNoticeContent(e.target.value)} required /></div><div className="form-group"><label>Target</label><select value={adminNoticeTargetType} onChange={(e) => setAdminNoticeTargetType(e.target.value)}><option>All</option><option>Course</option><option>Semester</option></select></div>{adminNoticeTargetType !== "All" && <div className="form-group"><label>Target Value</label><input value={adminNoticeTargetValue} onChange={(e) => setAdminNoticeTargetValue(e.target.value)} required /></div>}<button disabled={adminNoticeSubmitting}>{adminNoticeSubmitting ? "Publishing..." : "Publish Notice"}</button></form>}
              {adminNoticesLoading && <p>Loading notices...</p>}
              {!adminNoticesLoading && !adminNotices.length && <p>No notices found.</p>}
              {!adminNoticesLoading && adminNotices.map((notice) => <div className="data-card" key={notice.id}><h3>📢 {notice.title}</h3><p>{notice.content}</p><p>Target: {notice.target_type}{notice.target_value ? ` — ${notice.target_value}` : ""}</p><p>Created by: {notice.created_by || "N/A"}</p><p>{notice.created_at}</p><button type="button" disabled={adminNoticeDeletingId === notice.id} onClick={() => { if (window.confirm("Delete this notice from Omni360? It will be removed for Students and Faculty too.")) handleAdminNoticeDelete(notice.id); }}>{adminNoticeDeletingId === notice.id ? "Deleting..." : "🗑 Delete Notice"}</button></div>)}
              <button type="button" onClick={() => openAdminSection("overview")}>← Back to Overview</button>
            </div>
          )}

          {/* ========================================================
              ADMIN REPORTS
              ======================================================== */}
          {adminSection === "reports" && (
            <div style={facultyCardStyle}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}><div><h2>📈 Reports & Analytics</h2><p>Live operational metrics calculated from the Omni360 database.</p></div><button type="button" onClick={loadAdminReports}>↻ Refresh Report</button></div>
              {adminReportsError && <div className="error-box">{adminReportsError}</div>}
              {adminReportsLoading && <p>Loading report...</p>}
              {adminReports && <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
                <div className="data-card"><h3>📊 Attendance</h3><p>Total attended classes: <strong>{adminReports.total_attended_classes ?? 0}</strong></p><p>Total classes: <strong>{adminReports.total_classes ?? 0}</strong></p><p>Overall attendance: <strong>{adminReports.overall_attendance_percentage ?? 0}%</strong></p></div>
                <div className="data-card"><h3>💰 Fee Totals</h3><p>Total: ₹{Number(adminReports.fee_totals?.total || 0).toFixed(2)}</p><p>Paid: ₹{Number(adminReports.fee_totals?.paid || 0).toFixed(2)}</p><p>Pending: ₹{Number(adminReports.fee_totals?.pending || 0).toFixed(2)}</p></div>
                <div className="data-card"><h3>📝 Applications by Status</h3>{Object.entries(adminReports.applications_by_status || {}).map(([key,value]) => <p key={key}>{key}: <strong>{value}</strong></p>)}</div>
                <div className="data-card"><h3>👥 Students by Department</h3>{Object.entries(adminReports.students_by_department || {}).map(([key,value]) => <p key={key}>{key}: <strong>{value}</strong></p>)}</div>
                <div className="data-card"><h3>🚧 Campus Issues by Status</h3>{Object.entries(adminReports.campus_issues_by_status || {}).map(([key,value]) => <p key={key}>{key}: <strong>{value}</strong></p>)}</div>
                <div className="data-card"><h3>👨‍🏫 Faculty Complaints by Status</h3>{Object.entries(adminReports.faculty_complaints_by_status || {}).map(([key,value]) => <p key={key}>{key}: <strong>{value}</strong></p>)}</div>
                <div className="data-card"><h3>🚪 Gate Passes by Status</h3>{Object.entries(adminReports.gate_passes_by_status || {}).map(([key,value]) => <p key={key}>{key}: <strong>{value}</strong></p>)}</div>
              </div>}
              <button type="button" onClick={() => openAdminSection("overview")} style={{ marginTop: "20px" }}>← Back to Overview</button>
            </div>
          )}
          </div>
      )}


      {profilePhotoEditor && (
        <ProfilePhotoEditor
          editor={profilePhotoEditor}
          onClose={() => setProfilePhotoEditor(null)}
          onSave={handleProfilePhotoUpload}
        />
      )}

      {/* Public hero is shown only when nobody is logged in. */}
      {!studentDashboardOpen && !facultyDashboardOpen && !adminDashboardOpen && <section className="hero"><div className="hero-content"><div className="hero-label">COMMUNITY DIGITAL ASSISTANT</div><h1>Your Campus.<br /><span>Everything Connected.</span></h1><p>One simple digital platform to manage campus life, academic information, requests, complaints and more.</p><div className="hero-buttons"><button className="primary-button" onClick={() => openAuth("activate")}>Get Registered →</button><button className="secondary-button" onClick={() => openAuth("login")}>Login</button></div><div className="hero-info"><div><strong>Students</strong><span>One platform</span></div><div><strong>Faculty</strong><span>Easy management</span></div><div><strong>Admin</strong><span>Real-time visibility</span></div></div></div><div className="hero-visual"><div className="campus-card"><div className="card-header"><span>Omni360</span><span>●</span></div><h2>Campus<br />Dashboard</h2><div className="dashboard-items">{[["📚","Attendance","View attendance"],["📅","Timetable","Weekly classes"],["📝","Assignments","Track your work"],["📄","Applications","Submit requests"],["🏆","Certificates","Store proof securely"],["🚧","Campus Issues","Report problems"]].map(([icon,title,text]) => <div className="dashboard-item" key={title}><span>{icon}</span><div><strong>{title}</strong><small>{text}</small></div></div>)}</div></div></div></section>}
    </div>
  );
}

export default App;
