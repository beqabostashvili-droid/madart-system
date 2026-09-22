import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { Clock } from './clock';
import { SettingsService } from './settings/settings.service';

@Global()
@Module({
  providers: [Clock, SettingsService, AuditService],
  exports: [Clock, SettingsService, AuditService],
})
export class CommonModule {}
