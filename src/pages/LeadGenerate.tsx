import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { 
  User as UserIcon, 
  Briefcase, 
  ArrowRight,
  ShieldCheck,
  Zap,
  Check,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';
import { leadService } from '../services/leadService';
import { settingsService } from '../services/settingsService';
import { useAuthStore } from '../store/authStore';
import { usePermissions } from '../hooks/usePermissions';
import { BANGLADESH_GEOGRAPHY } from '../utils/bangladeshGeography';

const leadSchema = z.object({
  prospectName: z.string().min(3, 'Required'),
  mobile: z.string()
    .length(11, 'Mobile number must be exactly 11 digits')
    .refine(val => /^\d+$/.test(val), 'Mobile number must contain only numbers')
    .refine(val => val.startsWith('01'), 'Mobile number must start with 01'),
  profession: z.string().min(1, 'Required'),
  maritalStatus: z.string().min(1, 'Required'),
  noOfChildren: z.string().optional(),
  division: z.string().min(1, 'Required'),
  district: z.string().min(1, 'Required'),
  thana: z.string().min(1, 'Required'),
  source: z.string().min(1, 'Required'),
  productName: z.string().min(1, 'Required'),
  campaignName: z.string().min(1, 'Required'),
  residenceAddress: z.string().optional(),
  officeAddress: z.string().optional(),
  otherInfo: z.string().optional(),
  familyMember: z.string().optional(),
}).superRefine((data, ctx) => {
  const needsChild = ['Married', 'Divorced', 'Widowed', 'Widow'].includes(data.maritalStatus);
  if (needsChild) {
    if (!data.noOfChildren || data.noOfChildren.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Number of children is required',
        path: ['noOfChildren'],
      });
    }
  }
});

export default function LeadGenerate() {
  const { user } = useAuthStore();
  const { canAccess, userRole } = usePermissions();

  if (!canAccess('lead_upl_gen', 'bulk_generate_crm_leads')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 bg-white border border-[#F5E6CC] rounded-sm max-w-xl mx-auto space-y-6 animate-in fade-in duration-300 mt-12">
        <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-100 flex items-center justify-center text-[#978C21] shrink-0 transform hover:rotate-12 transition-transform">
          <AlertCircle className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <span className="text-[9px] font-black tracking-[0.25em] text-[#978C21] uppercase italic">Clearance Protocol Warning</span>
          <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight italic">Access Denied</h2>
          <p className="text-[11px] text-slate-400 font-bold uppercase tracking-wider leading-relaxed">
            Your current clearance level <span className="text-red-550 font-black">"{userRole || 'RESTRICTED'}"</span> does not possess active credentials to perform bulk lead generation or manually create live CRM records.
          </p>
        </div>
        <div className="pt-2 border-t border-slate-100 w-full text-[9px] font-mono text-slate-400 uppercase tracking-widest leading-none">
          Strict Security Level: Feature lead_upl_gen.bulk_generate_crm_leads Required
        </div>
      </div>
    );
  }
  const [options, setOptions] = useState<any>({});
  const { register, handleSubmit, watch, reset, setValue, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      prospectName: '',
      mobile: '',
      profession: '',
      maritalStatus: '',
      noOfChildren: '',
      division: '',
      district: '',
      thana: '',
      source: '',
      productName: '',
      campaignName: '',
      residenceAddress: '',
      officeAddress: '',
      otherInfo: '',
      familyMember: ''
    }
  });

  useEffect(() => {
    const loadOptions = async () => {
      const types = ['Profession', 'MaritalStatus', 'Area', 'Source', 'Product', 'Campaign'];
      const results = await Promise.all(types.map(t => settingsService.getOptionsByType(t)));
      const newOptions: any = {};
      types.forEach((t, i) => { newOptions[t] = results[i]; });
      setOptions(newOptions);
    };
    loadOptions();
  }, []);

  const maritalStatus = watch('maritalStatus');
  const selectedDivision = watch('division');
  const selectedDistrict = watch('district');

  useEffect(() => {
    setValue('district', '');
    setValue('thana', '');
  }, [selectedDivision, setValue]);

  useEffect(() => {
    setValue('thana', '');
  }, [selectedDistrict, setValue]);

  const divisions = Object.keys(BANGLADESH_GEOGRAPHY);
  const districts = selectedDivision ? Object.keys(BANGLADESH_GEOGRAPHY[selectedDivision] || {}) : [];
  const thanas = (selectedDivision && selectedDistrict) ? (BANGLADESH_GEOGRAPHY[selectedDivision]?.[selectedDistrict] || []) : [];

  const onSubmit = async (data: any) => {
    if (!user) return;
    
    const combinedArea = `${data.thana}, ${data.district}, ${data.division}`;
    const childPresence = ['Married', 'Divorced', 'Widowed', 'Widow'].includes(data.maritalStatus);
    
    try {
      await leadService.createLead({
        ...data,
        area: combinedArea,
        hasChild: childPresence && Number(data.noOfChildren) > 0,
        noOfChildren: childPresence ? data.noOfChildren : '0',
        assignedTo: user.employeeId,
        assignedBy: user.employeeId,
        currentStatus: 'Untouched',
        projectedNCP: 0,
        collectedNCP: 0,
        creationDate: new Date().toISOString(),
        timestamp: new Date().toISOString()
      });
      toast.success('Prospect synchronized with Shanta Life Core');
      reset();
    } catch (err) {
      toast.error('Synchronization failure');
    }
  };

  return (
    <div className="max-w-5xl mx-auto pb-24 space-y-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 border-b border-slate-100 pb-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-slate-900 rounded-sm flex items-center justify-center text-[#978C21] shadow-xl">
            <Zap className="w-8 h-8 fill-[#978C21]" />
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-brand-text italic uppercase serif leading-none">Capture Intelligence</h1>
            <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.3em] mt-3 italic">Prospect Onboarding Protocol v2.4</p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-10">
        {/* Section 1: Identity */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-sm border border-slate-100 p-10 shadow-sm"
        >
          <div className="flex items-center gap-4 mb-12 border-b border-slate-50 pb-6">
            <UserIcon className="w-6 h-6 text-[#978C21]" />
            <h2 className="font-black text-[14px] uppercase tracking-[0.2em] text-brand-text italic serif">Identity Matrix</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Prospect Nominal *</label>
              <input 
                {...register('prospectName')}
                className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-sm font-black uppercase tracking-tight italic focus:ring-2 focus:ring-primary/5 focus:border-[#978C21] transition-all outline-none" 
                placeholder="PROSPECT FULL NAME"
              />
              {errors.prospectName && <p className="text-[10px] text-red-500 font-black italic">{errors.prospectName.message}</p>}
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic flex items-center justify-between">
                <span>Contact Uplink *</span>
                <span className="text-[8px] text-[#978C21] font-black normal-case">(For example, starts with 01, exactly 11 digits)</span>
              </label>
              <input 
                type="text"
                maxLength={11}
                {...register('mobile', {
                  onChange: (e) => {
                    e.target.value = e.target.value.replace(/\D/g, '');
                  }
                })}
                className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-sm font-black uppercase tracking-tight focus:ring-2 focus:ring-primary/5 focus:border-[#978C21] transition-all outline-none" 
                placeholder="For example: 01712345678"
              />
              {errors.mobile && <p className="text-[10px] text-red-500 font-black italic">{errors.mobile.message}</p>}
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Profession Logic</label>
              <select 
                {...register('profession')}
                className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-xs font-black uppercase tracking-widest italic focus:ring-2 focus:ring-primary/5 focus:border-[#978C21] transition-all outline-none cursor-pointer"
              >
                <option value="">SELECT PROFESSION</option>
                {options.Profession?.map((p: string) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Marital Status</label>
              <select 
                {...register('maritalStatus')}
                className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-xs font-black uppercase tracking-widest italic focus:ring-2 focus:ring-primary/5 focus:border-[#978C21] transition-all outline-none cursor-pointer"
              >
                <option value="">SELECT STATUS</option>
                {options.MaritalStatus?.map((m: string) => <option key={m} value={m}>{m}</option>)}
              </select>
              {errors.maritalStatus && <p className="text-[10px] text-red-500 font-black italic">{errors.maritalStatus.message}</p>}
            </div>

            {['Married', 'Divorced', 'Widowed', 'Widow'].includes(maritalStatus) && (
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Number of Children *</label>
                <input 
                  type="number"
                  min="0"
                  {...register('noOfChildren')}
                  className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-sm font-black uppercase tracking-tight italic focus:ring-2 focus:ring-primary/5 focus:border-[#978C21] transition-all outline-none" 
                  placeholder="NUMBER OF CHILDREN"
                />
                {errors.noOfChildren && <p className="text-[10px] text-red-500 font-black italic">{errors.noOfChildren.message}</p>}
              </div>
            )}
          </div>
        </motion.section>

        {/* Section 2: Strategy */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-sm border border-slate-100 p-10 shadow-sm"
        >
          <div className="flex items-center gap-4 mb-12 border-b border-slate-50 pb-6">
            <Briefcase className="w-6 h-6 text-[#978C21]" />
            <h2 className="font-black text-[14px] uppercase tracking-[0.2em] text-brand-text italic serif">Addressing Prospects</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Operational Division *</label>
              <select 
                {...register('division')}
                className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-xs font-black uppercase tracking-widest italic focus:ring-2 focus:ring-primary/5 focus:border-[#978C21] transition-all outline-none cursor-pointer"
              >
                <option value="">SELECT DIVISION</option>
                {divisions.map((d: string) => <option key={d} value={d}>{d.toUpperCase()}</option>)}
              </select>
              {errors.division && <p className="text-[10px] text-red-500 font-black italic">{errors.division.message}</p>}
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Operational District *</label>
              <select 
                {...register('district')}
                disabled={!selectedDivision}
                className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-xs font-black uppercase tracking-widest italic focus:ring-2 focus:ring-primary/5 focus:border-[#978C21] transition-all outline-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <option value="">SELECT DISTRICT</option>
                {districts.map((d: string) => <option key={d} value={d}>{d.toUpperCase()}</option>)}
              </select>
              {errors.district && <p className="text-[10px] text-red-500 font-black italic">{errors.district.message}</p>}
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Operational Thana / Upazila *</label>
              <select 
                {...register('thana')}
                disabled={!selectedDistrict}
                className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-xs font-black uppercase tracking-widest italic focus:ring-2 focus:ring-primary/5 focus:border-[#978C21] transition-all outline-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <option value="">SELECT THANA</option>
                {thanas.map((t: string) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
              {errors.thana && <p className="text-[10px] text-red-500 font-black italic">{errors.thana.message}</p>}
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Target Asset / Product *</label>
              <select 
                {...register('productName')}
                className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-xs font-black uppercase tracking-widest italic focus:ring-2 focus:ring-primary/5 focus:border-[#978C21] transition-all outline-none cursor-pointer"
              >
                <option value="">SELECT PRODUCT</option>
                {options.Product?.map((p: string) => <option key={p} value={p}>{p}</option>)}
              </select>
              {errors.productName && <p className="text-[10px] text-red-500 font-black italic">{errors.productName.message}</p>}
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Acquisition Source *</label>
              <select 
                {...register('source')}
                className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-xs font-black uppercase tracking-widest italic focus:ring-2 focus:ring-primary/5 focus:border-[#978C21] transition-all outline-none cursor-pointer"
              >
                <option value="">SELECT SOURCE</option>
                {options.Source?.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
              {errors.source && <p className="text-[10px] text-red-500 font-black italic">{errors.source.message}</p>}
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Campaign Directive *</label>
              <select 
                {...register('campaignName')}
                className="w-full px-5 py-4 bg-[#FBFAF8] border border-slate-100 rounded-sm text-xs font-black uppercase tracking-widest italic focus:ring-2 focus:ring-primary/5 focus:border-[#978C21] transition-all outline-none cursor-pointer"
              >
                <option value="">SELECT CAMPAIGN</option>
                {options.Campaign?.map((c: string) => <option key={c} value={c}>{c}</option>)}
              </select>
              {errors.campaignName && <p className="text-[10px] text-red-500 font-black italic">{errors.campaignName.message}</p>}
            </div>
          </div>
        </motion.section>

        <div className="flex items-center justify-end gap-6 mt-16 group">
          <div className="flex items-center gap-2 mr-auto italic opacity-40">
             <ShieldCheck className="w-4 h-4 text-emerald-500" />
             <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Secure Insertion Active</span>
          </div>
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-64 py-5 bg-slate-900 hover:bg-black text-white text-[12px] font-black uppercase tracking-[0.4em] transition-all rounded-sm shadow-2xl flex items-center justify-center gap-4 group italic disabled:opacity-50"
          >
            {isSubmitting ? 'SYNCING...' : (
              <>
                Generate Lead
                <ArrowRight className="w-5 h-5 text-[#978C21] group-hover:translate-x-2 transition-transform" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
