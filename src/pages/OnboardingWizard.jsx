// src/pages/OnboardingWizard.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../api/supabase";
import { useOrg } from "../context/OrganizationContext";
import toast from "react-hot-toast";
import { Building, Users, IndianRupee, Globe, ArrowRight, ArrowLeft, Check } from "lucide-react";

const STEPS = ["Branches", "Invite Staff", "Fee Setup", "Domain"];

export default function OnboardingWizard() {
  const navigate = useNavigate();
  const orgContext = useOrg();   // may be undefined if provider is missing

  const [org, setOrg] = useState(orgContext?.org || null);
  const [loading, setLoading] = useState(false);

  // Fetch org from profile if context didn't provide it
  useEffect(() => {
    if (!org) {
      const loadOrg = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .single();
        if (profile?.organization_id) {
          const { data: orgData } = await supabase
            .from("organization")
            .select("*")
            .eq("id", profile.organization_id)
            .single();
          if (orgData) setOrg(orgData);
        }
      };
      loadOrg();
    }
  }, [org]);

  // Also get branch and financial year from context for inserts
  const branchId = orgContext?.branch?.id;
  const financialYearId = orgContext?.selectedFinancialYear?.id;

  const [step, setStep] = useState(0);
  const [branches, setBranches] = useState([{ branch_name: "", address: "" }]);
  const [invites, setInvites] = useState([{ email: "", role: "teacher", name: "" }]);
  const [feeName, setFeeName] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [domain, setDomain] = useState("");

  const addBranch = () => setBranches([...branches, { branch_name: "", address: "" }]);
  const removeBranch = (idx) => setBranches(branches.filter((_, i) => i !== idx));
  const updateBranch = (idx, field, value) => {
    const updated = [...branches];
    updated[idx][field] = value;
    setBranches(updated);
  };

  const addInvite = () => setInvites([...invites, { email: "", role: "teacher", name: "" }]);
  const removeInvite = (idx) => setInvites(invites.filter((_, i) => i !== idx));
  const updateInvite = (idx, field, value) => {
    const updated = [...invites];
    updated[idx][field] = value;
    setInvites(updated);
  };

  const handleNext = async () => {
    if (step === STEPS.length - 1) {
      await finishOnboarding();
      return;
    }
    setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const finishOnboarding = async () => {
    if (!org) {
      toast.error("Organization not loaded. Please refresh.");
      return;
    }
    setLoading(true);
    try {
      // 1. Save branches
      const validBranches = branches.filter((b) => b.branch_name.trim());
      if (validBranches.length) {
        await supabase.from("branches").insert(
          validBranches.map((b) => ({
            organization_id: org.id,
            branch_name: b.branch_name,
            address: b.address,
          }))
        );
      }

      // 2. Invites (simulated – you can add email sending later)
      const validInvites = invites.filter((i) => i.email.trim());
      if (validInvites.length) {
        toast.success(`${validInvites.length} invitations saved (email sending coming soon)`);
      }

      // 3. Fee structure (quick setup) – include branch and financial year
      if (feeName && feeAmount) {
        // Find or create a default course
        const { data: course } = await supabase
          .from("courses")
          .select("id")
          .eq("course_name", "Default Course")
          .maybeSingle();
        let courseId = course?.id;
        if (!courseId) {
          const { data: newCourse } = await supabase
            .from("courses")
            .insert({ course_name: "Default Course", status: true })
            .select()
            .single();
          courseId = newCourse.id;
        }
        await supabase.from("fee_structures").insert({
          course_id: courseId,
          fee_amount: Number(feeAmount),
          installment_allowed: false,
          branch_id: branchId || 1,                // use current branch or fallback
          financial_year_id: financialYearId,       // current financial year
        });
      }

      // 4. Domain
      if (domain) {
        await supabase.from("organization_domains").insert({
          organization_id: org.id,
          domain,
          is_primary: false,
          verified: false,
        });
      }

      toast.success("Onboarding complete!");
      navigate("/");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-2xl w-full bg-white rounded-xl shadow p-8">
        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-8">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  i <= step ? "bg-primary text-white" : "bg-gray-200 text-gray-500"
                }`}
              >
                {i < step ? <Check size={16} /> : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-1 mx-2 ${i < step ? "bg-primary" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        {!org ? (
          <div className="text-center py-8 text-secondary">Loading organization…</div>
        ) : (
          <>
            {/* Step 0 – Branches */}
            {step === 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Building size={20} /> Add Branches
                </h2>
                {branches.map((b, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Branch name"
                      value={b.branch_name}
                      onChange={(e) => updateBranch(idx, "branch_name", e.target.value)}
                      className="flex-1 border rounded-lg p-2 text-sm"
                    />
                    <input
                      type="text"
                      placeholder="Address (optional)"
                      value={b.address}
                      onChange={(e) => updateBranch(idx, "address", e.target.value)}
                      className="flex-1 border rounded-lg p-2 text-sm"
                    />
                    {branches.length > 1 && (
                      <button onClick={() => removeBranch(idx)} className="text-red-500 px-2">
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={addBranch} className="text-primary text-sm hover:underline">
                  + Add another branch
                </button>
              </div>
            )}

            {/* Step 1 – Invite Staff */}
            {step === 1 && (
              <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Users size={20} /> Invite Staff
                </h2>
                {invites.map((inv, idx) => (
                  <div key={idx} className="flex gap-2 mb-2">
                    <input
                      type="text"
                      placeholder="Name"
                      value={inv.name}
                      onChange={(e) => updateInvite(idx, "name", e.target.value)}
                      className="w-1/3 border rounded-lg p-2 text-sm"
                    />
                    <input
                      type="email"
                      placeholder="Email"
                      value={inv.email}
                      onChange={(e) => updateInvite(idx, "email", e.target.value)}
                      className="flex-1 border rounded-lg p-2 text-sm"
                    />
                    <select
                      value={inv.role}
                      onChange={(e) => updateInvite(idx, "role", e.target.value)}
                      className="border rounded-lg p-2 text-sm"
                    >
                      <option value="teacher">Teacher</option>
                      <option value="branch_admin">Branch Admin</option>
                      <option value="organization_admin">Org Admin</option>
                    </select>
                    {invites.length > 1 && (
                      <button onClick={() => removeInvite(idx)} className="text-red-500 px-2">
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={addInvite} className="text-primary text-sm hover:underline">
                  + Add another invite
                </button>
              </div>
            )}

            {/* Step 2 – Fee Structure */}
            {step === 2 && (
              <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <IndianRupee size={20} /> Quick Fee Setup
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Set a default fee structure (you can change this later).
                </p>
                <div className="flex gap-4">
                  <input
                    type="text"
                    placeholder="Fee name"
                    value={feeName}
                    onChange={(e) => setFeeName(e.target.value)}
                    className="flex-1 border rounded-lg p-2 text-sm"
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={feeAmount}
                    onChange={(e) => setFeeAmount(e.target.value)}
                    className="w-32 border rounded-lg p-2 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Step 3 – Domain */}
            {step === 3 && (
              <div>
                <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                  <Globe size={20} /> Custom Domain (Optional)
                </h2>
                <p className="text-sm text-gray-500 mb-4">
                  Use your own domain for the ERP (e.g., erp.yourcompany.com).
                </p>
                <input
                  type="text"
                  placeholder="erp.myacademy.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className="w-full border rounded-lg p-2 text-sm"
                />
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex justify-between mt-8">
              <button
                onClick={handleBack}
                disabled={step === 0}
                className="flex items-center gap-2 px-4 py-2 border rounded-lg text-sm disabled:opacity-50"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <button
                onClick={handleNext}
                disabled={loading}
                className="flex items-center gap-2 bg-primary text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50"
              >
                {step === STEPS.length - 1 ? (
                  loading ? "Finishing..." : "Complete Setup"
                ) : (
                  <>
                    Next <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}