from django.contrib import admin
from .models import EmployeeProfile


@admin.register(EmployeeProfile)
class EmployeeProfileAdmin(admin.ModelAdmin):
    list_display = ("employee_id", "user", "mobile_number", "role")
    search_fields = ("employee_id", "user__username", "mobile_number")
    list_filter = ("role",)